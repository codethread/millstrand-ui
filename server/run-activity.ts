import type { AgentDirectory, AgentRun, RunActivity } from '../shared/api.ts';
import type { SessionLogReader } from './session-log-reader.ts';

/**
 * Harnesses never settles or heartbeats external sessions, so without fresh evidence a
 * persisted `running` status cannot mean active execution. An hour of silence is the
 * user-accepted heuristic; any new dialogue write restores `recent` on the next poll.
 */
export const quietAfterMs = 60 * 60 * 1000;

/** Strand timestamps are UTC `YYYY-MM-DD HH:MM:SS`; ISO strings pass through. */
function instant(timestamp: string): number {
  const time = Date.parse(timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`);
  if (Number.isNaN(time)) throw new Error(`Unsupported run timestamp: ${timestamp}`);
  return time;
}

export function externalRunActivity(
  run: Pick<AgentRun, 'createdAt' | 'startedAt'>,
  lastWrittenAt: Date | null,
  now: Date,
): RunActivity {
  const evidence = [run.createdAt, run.startedAt].flatMap((value) =>
    value === null ? [] : [instant(value)],
  );
  if (lastWrittenAt !== null) evidence.push(lastWrittenAt.getTime());
  const latest = Math.max(...evidence);
  const lastActivityAt = new Date(latest).toISOString();
  return now.getTime() - latest > quietAfterMs
    ? { kind: 'quiet', lastActivityAt }
    : { kind: 'recent', lastActivityAt };
}

function observed(run: AgentRun): boolean {
  return run.ownership === 'external' && run.status === 'running';
}

/** Adds dialogue-log evidence to unsettled external runs; managed lifecycles are untouched. */
export async function observeRunActivity(
  directory: AgentDirectory,
  logs: SessionLogReader,
  now = new Date(),
): Promise<AgentDirectory> {
  const updated = new Map<string, AgentRun>();
  await Promise.all(
    directory.runs.filter(observed).map(async (run) => {
      const written =
        run.session === null
          ? null
          : await logs.lastWrittenAt(run.session.provider, run.session.session);
      updated.set(run.id, { ...run, activity: externalRunActivity(run, written, now) });
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
