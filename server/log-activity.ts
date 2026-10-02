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
  const { bindings, activeIdentityStrandIds } = provenance.logActivityBindings();
  // Overview summaries are bounded; full session tails are fetched only on demand.
  let watched = 0;
  for (const binding of bindings) {
    if (!binding.source || !activeIdentityStrandIds.has(binding.identityStrandId)) continue;
    if (watched++ >= 60) {
      binding.activity = {
        kind: 'unavailable',
        message: 'Live summary limit reached; open the session to inspect.',
      };
      continue;
    }
    try {
      const summary = await reader.summary(binding.source.provider, binding.source.session);
      binding.activity = {
        kind: 'available',
        latest: summary.latest,
        modifiedAt: summary.modifiedAt,
      };
    } catch {
      binding.activity = { kind: 'unavailable', message: 'No readable local dialogue log yet.' };
    }
  }
  return { bindings };
}
