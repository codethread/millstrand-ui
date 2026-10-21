import type { AgentDirectory, AgentRun, RunActivity } from '../shared/api.ts';
import type { SessionLogReader } from './session-log-reader.ts';

/**
 * Harnesses never settles or heartbeats external sessions, so without fresh evidence a
 * persisted `running` status cannot mean active execution. An hour of silence is the
 * user-accepted heuristic; any new dialogue record restores `recent` on the next poll.
 */
export const quietAfterMs = 60 * 60 * 1000;

/** Latest observed dialogue record for a session; `ended` when that record closed it. */
export type SessionEvidence = { at: Date; ended: boolean } | null;

/** Strand timestamps are UTC `YYYY-MM-DD HH:MM:SS`; ISO strings pass through. */
function instant(timestamp: string): number {
  const time = Date.parse(timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`);
  if (Number.isNaN(time)) throw new Error(`Unsupported activity timestamp: ${timestamp}`);
  return time;
}

export function externalRunActivity(
  run: Pick<AgentRun, 'createdAt' | 'startedAt'>,
  evidence: SessionEvidence,
  now: Date,
): RunActivity {
  const registered = Math.max(
    ...[run.createdAt, run.startedAt].flatMap((value) => (value === null ? [] : [instant(value)])),
  );
  const latest = Math.max(registered, evidence?.at.getTime() ?? registered);
  const lastActivityAt = new Date(latest).toISOString();
  const endedLast = evidence !== null && evidence.ended && evidence.at.getTime() >= registered;
  return endedLast || now.getTime() - latest > quietAfterMs
    ? { kind: 'quiet', lastActivityAt }
    : { kind: 'recent', lastActivityAt };
}

function decode(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

/** Codex child runs are keyed `codex-child:v1:<base64 parent>:<base64 child>`. */
export function codexChildSession(key: string): { parent: string; child: string } | null {
  const match = /^codex-child:v1:([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*)$/.exec(key);
  if (match === null) return null;
  return { parent: decode(match[1]!), child: decode(match[2]!) };
}

/**
 * Only logs written inside the quiet window are read: an older write already bounds every
 * record in the file, so the run is quiet without opening it.
 */
async function sessionEvidence(
  run: AgentRun,
  logs: SessionLogReader,
  now: Date,
): Promise<SessionEvidence> {
  if (run.session === null) return null;
  const child = run.session.provider === 'codex' ? codexChildSession(run.session.session) : null;
  const stem = child?.parent ?? run.session.session;
  const written = await logs.lastWrittenAt(run.session.provider, stem);
  if (written === null) return null;
  if (now.getTime() - written.getTime() > quietAfterMs) return { at: written, ended: false };
  if (child !== null) {
    // Child tool events are captured in the parent's log under the child's agent ID.
    const { events } = await logs.snapshot('codex', child.parent);
    const own = events.filter((event) => event.record.agent_id === child.child).at(-1);
    // Capture timestamps are hook-written; an unreadable one is simply not evidence.
    const at = own === undefined ? Number.NaN : Date.parse(own.record.ts);
    return Number.isNaN(at) ? null : { at: new Date(at), ended: false };
  }
  const { latest } = await logs.summary(run.session.provider, stem);
  return {
    at: written,
    ended: latest?.record.event === 'session_end' && !latest.record.agent_id,
  };
}

/**
 * A managed run keeps its lifecycle unless its own top-level session log last recorded an
 * explicit end after this run was registered. A resumed session or a newer run on the same
 * native session writes past the end and keeps the run live; silence alone never ages a
 * managed run out, and child sessions are not ended by their parent's end.
 */
async function managedRunActivity(run: AgentRun, logs: SessionLogReader): Promise<RunActivity> {
  const lifecycle: RunActivity = { kind: 'lifecycle' };
  if (run.session === null) return lifecycle;
  if (run.session.provider === 'codex' && codexChildSession(run.session.session) !== null)
    return lifecycle;
  const { provider, session } = run.session;
  if ((await logs.lastWrittenAt(provider, session)) === null) return lifecycle;
  const { latest } = await logs.summary(provider, session);
  if (latest?.record.event !== 'session_end' || latest.record.agent_id) return lifecycle;
  const endedAt = Date.parse(latest.record.ts);
  const registered = Math.max(
    ...[run.createdAt, run.startedAt].flatMap((value) => (value === null ? [] : [instant(value)])),
  );
  return Number.isNaN(endedAt) || endedAt < registered
    ? lifecycle
    : { kind: 'quiet', lastActivityAt: new Date(endedAt).toISOString() };
}

async function runActivity(run: AgentRun, logs: SessionLogReader, now: Date) {
  return run.ownership === 'external'
    ? externalRunActivity(run, await sessionEvidence(run, logs, now), now)
    : managedRunActivity(run, logs);
}

/** Adds dialogue evidence to unsettled runs; see the external and managed rules above. */
export async function observeRunActivity(
  directory: AgentDirectory,
  logs: SessionLogReader,
  now = new Date(),
): Promise<AgentDirectory> {
  const updated = new Map<string, AgentRun>();
  await Promise.all(
    directory.runs
      .filter((run) => run.status === 'running')
      .map(async (run) => {
        const activity = await runActivity(run, logs, now);
        if (activity.kind !== 'lifecycle') updated.set(run.id, { ...run, activity });
      }),
  );
  if (updated.size === 0) return directory;
  const replace = (run: AgentRun): AgentRun => updated.get(run.id) ?? run;
  return {
    ...directory,
    runs: directory.runs.map(replace),
    identities: directory.identities.map((identity) => ({
      ...identity,
      runs: identity.runs.map(replace),
    })),
  };
}
