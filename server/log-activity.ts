import { z } from 'zod';
import { providerSchema } from '../shared/session-log.ts';
import type { LogActivity, LogBinding } from '../shared/log-activity.ts';
import { parseAgents } from './agents.ts';
import { SessionLogReader } from './session-log-reader.ts';

const identityRowsSchema = z.array(
  z.object({
    attributes: z.object({
      'identity/session': z.string().optional(),
      'identity/id': z.string().optional(),
      'identity/harness': z.string().optional(),
      'identity/native-session-id': z.string().optional(),
    }),
  }),
);
/** Exact persisted native-session linkage only. Never match by cwd, model or mtime. */
export function logBindings(rows: unknown): LogBinding[] {
  return identityRowsSchema.parse(rows).flatMap(({ attributes: attrs }) => {
    if (attrs['identity/session'] !== 'true' || !attrs['identity/id']) return [];
    const provider = providerSchema.safeParse(attrs['identity/harness']);
    const session = attrs['identity/native-session-id'];
    return [
      {
        identity: attrs['identity/id'],
        source: provider.success && session ? { provider: provider.data, session } : null,
        activity: { kind: 'idle' as const },
      },
    ];
  });
}
export async function readLogActivity(
  rows: unknown,
  reader: SessionLogReader,
): Promise<LogActivity> {
  const active = new Set(
    parseAgents(rows)
      .filter((identity) => identity.runs.some((run) => run.status === 'running'))
      .map((identity) => identity.id),
  );
  const bindings = logBindings(rows);
  // Overview summaries are bounded; full session tails are fetched only on demand.
  let watched = 0;
  for (const binding of bindings) {
    if (!binding.source || !active.has(binding.identity)) continue;
    if (watched++ >= 60) {
      binding.activity = {
        kind: 'unavailable',
        message: 'Live summary limit reached; open the session to inspect.',
      };
      continue;
    }
    try {
      const snapshot = await reader.snapshot(binding.source.provider, binding.source.session);
      binding.activity = {
        kind: 'available',
        latest: snapshot.events.at(-1) ?? null,
        modifiedAt: snapshot.modifiedAt,
      };
    } catch {
      binding.activity = { kind: 'unavailable', message: 'No readable local dialogue log yet.' };
    }
  }
  return { bindings };
}
