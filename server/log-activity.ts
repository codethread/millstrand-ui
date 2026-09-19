import { z } from 'zod';
import { providerSchema } from '../shared/session-log.ts';
import type { LogActivity, LogBinding } from '../shared/log-activity.ts';
import { sorted } from '../shared/array.ts';
import { parseAgents } from './agents.ts';
import { SessionLogReader } from './session-log-reader.ts';

const logRowsSchema = z.array(
  z.object({
    id: z.string(),
    created_at: z.string(),
    attributes: z.object({
      'identity/session': z.string().optional(),
      'identity/id': z.string().optional(),
      'identity/harness': z.string().optional(),
      'identity/native-session-id': z.string().optional(),
      'harness/run': z.string().optional(),
      'harness/published': z.string().optional(),
      'harness/session-id': z.string().optional(),
      'harness/harness': z.string().optional(),
      'harness/status': z.string().optional(),
    }),
  }),
);

interface PersistedRunSource {
  id: string;
  createdAt: string;
  status: string | undefined;
  source: LogBinding['source'];
}

function newestRunSource(a: PersistedRunSource, b: PersistedRunSource): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

/** Exact persisted identity or published-run session linkage only. Never match by cwd, model or mtime. */
export function logBindings(rows: unknown): LogBinding[] {
  const parsed = logRowsSchema.parse(rows);
  const runSources = new Map<string, PersistedRunSource[]>();
  for (const { id, created_at: createdAt, attributes: attrs } of parsed) {
    const identity = attrs['identity/id'];
    const provider = providerSchema.safeParse(attrs['harness/harness']);
    const session = attrs['harness/session-id'];
    if (
      attrs['harness/run'] !== 'true' ||
      attrs['harness/published'] !== 'true' ||
      !identity ||
      !provider.success ||
      !session
    )
      continue;
    runSources.set(identity, [
      ...(runSources.get(identity) ?? []),
      {
        id,
        createdAt,
        status: attrs['harness/status'],
        source: { provider: provider.data, session },
      },
    ]);
  }
  return parsed.flatMap(({ attributes: attrs }) => {
    if (attrs['identity/session'] !== 'true' || !attrs['identity/id']) return [];
    const provider = providerSchema.safeParse(attrs['identity/harness']);
    const session = attrs['identity/native-session-id'];
    const identitySource =
      provider.success && session ? { provider: provider.data, session } : null;
    const candidates = sorted(runSources.get(attrs['identity/id']) ?? [], newestRunSource);
    const runningSource = candidates.find((candidate) => candidate.status === 'running')?.source;
    return [
      {
        identity: attrs['identity/id'],
        source: runningSource ?? identitySource ?? candidates[0]?.source ?? null,
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
