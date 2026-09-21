import type { LogActivity, LogBinding } from '../shared/log-activity.ts';
import { ProvenanceIndex } from './provenance.ts';
import { SessionLogReader } from './session-log-reader.ts';

/** Exact persisted performed/native-session linkage only. Never match by cwd, model or mtime. */
export function logBindings(snapshot: unknown): LogBinding[] {
  return new ProvenanceIndex(snapshot).logBindings();
}

export async function readLogActivity(
  provenance: ProvenanceIndex,
  reader: SessionLogReader,
): Promise<LogActivity> {
  const { identities } = provenance.agents();
  const active = new Set(
    identities
      .filter((identity) => identity.runs.some((run) => run.status === 'running'))
      .map((identity) => identity.strandId),
  );
  const bindings = provenance.logBindings();
  // Overview summaries are bounded; full session tails are fetched only on demand.
  let watched = 0;
  for (const binding of bindings) {
    const identity = identities.find(
      (candidate) => candidate.strandId === binding.identityStrandId,
    );
    if (!binding.source || !identity || !active.has(identity.strandId)) continue;
    if (watched++ >= 60) {
      binding.activity = {
        kind: 'unavailable',
        message: 'Live summary limit reached; open the session to inspect.',
      };
      continue;
    }
    try {
      const log = await reader.snapshot(binding.source.provider, binding.source.session);
      binding.activity = {
        kind: 'available',
        latest: log.events.at(-1) ?? null,
        modifiedAt: log.modifiedAt,
      };
    } catch {
      binding.activity = { kind: 'unavailable', message: 'No readable local dialogue log yet.' };
    }
  }
  return { bindings };
}
