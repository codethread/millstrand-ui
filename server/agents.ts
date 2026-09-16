import type { AgentIdentity, AgentRun, AgentRunStatus, AgentWork } from '../shared/api.ts';
import { sorted } from '../shared/array.ts';
import { z } from 'zod';
import { object } from './parse.ts';

const agentStrandSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable().optional(),
    state: z.string(),
    attributes: z.unknown(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .loose();
const agentStrandsSchema = z.compile(z.array(agentStrandSchema), { strict: true });
const stringSchema = z.compile(z.string(), { strict: true });
const nullableStringSchema = z.compile(z.string().nullable().optional(), { strict: true });
const stringArraySchema = z.compile(z.array(z.string()), { strict: true });

type AgentStrand = z.infer<typeof agentStrandSchema>;

function requiredString(value: unknown, where: string): string {
  const parsed = stringSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${where} must be a string`);
  return parsed.data;
}

function nullableString(value: unknown, where: string): string | null {
  const parsed = nullableStringSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${where} must be a string`);
  return parsed.data ?? null;
}

function stringArray(value: unknown, where: string): string[] {
  const parsed = stringArraySchema.safeParse(value);
  if (!parsed.success) throw new Error(`${where} must be an array`);
  return parsed.data;
}

function parseAgentStrand(value: AgentStrand): {
  id: string;
  title: string;
  state: string;
  attributes: Record<string, unknown>;
  createdAt: string | null;
} {
  return {
    id: value.id,
    title: value.title ?? '(untitled)',
    state: value.state,
    attributes: object(value.attributes, 'agent.attributes'),
    createdAt: value.created_at ?? null,
  };
}

/** List projections omit large prompt/result values. Only expose inspection fields,
 * never provider environment, injected prompts, or credentials through this API. */
export function parseAgents(value: unknown): AgentIdentity[] {
  const parsed = agentStrandsSchema.safeParse(value);
  if (!parsed.success) throw new Error('agent strands must be an array');
  const rows = parsed.data.map(parseAgentStrand);
  const runs = new Map<string, AgentRun[]>();
  const work = new Map<string, AgentWork[]>();
  for (const row of rows) {
    const attrs = row.attributes;
    // Historical published runs can predate identity linkage and cannot join an identity.
    if (
      attrs['harness/run'] === 'true' &&
      attrs['harness/published'] === 'true' &&
      attrs['identity/id'] != null
    ) {
      const identity = requiredString(attrs['identity/id'], 'run.identity/id');
      const statuses: AgentRunStatus[] = ['ready', 'running', 'stopped', 'failed'];
      const run: AgentRun = {
        id: row.id,
        requestId: nullableString(attrs['harness/request-id'], 'run.requestId'),
        title: row.title,
        alias: requiredString(attrs['harness/alias'], 'run.alias'),
        harness: requiredString(attrs['harness/harness'], 'run.harness'),
        status: statuses.find((status) => status === attrs['harness/status']) ?? 'unknown',
        substatus: nullableString(attrs['harness/substatus'], 'run.substatus'),
        mode: requiredString(attrs['harness/mode'], 'run.mode'),
        model: nullableString(attrs['harness/model'], 'run.model'),
        effort: nullableString(attrs['harness/effort'], 'run.effort'),
        cwd: nullableString(attrs['harness/cwd'], 'run.cwd'),
        target: nullableString(attrs['harness/target'], 'run.target'),
        rootTargets:
          attrs['harness/root-targets'] == null
            ? []
            : stringArray(attrs['harness/root-targets'], 'run.rootTargets'),
        createdAt: requiredString(row.createdAt, 'run.createdAt'),
        startedAt: nullableString(attrs['harness/started-at'], 'run.startedAt'),
        finishedAt: nullableString(attrs['harness/finished-at'], 'run.finishedAt'),
      };
      runs.set(identity, [...(runs.get(identity) ?? []), run]);
    }
    if (typeof attrs['owner'] === 'string') {
      const owner = attrs['owner'];
      work.set(owner, [
        ...(work.get(owner) ?? []),
        {
          id: row.id,
          title: row.title,
          state: row.state,
          kind:
            attrs['kanban/card'] === 'true'
              ? 'card'
              : attrs['kanban/task'] === 'true'
                ? 'task'
                : 'work',
        },
      ]);
    }
  }
  return rows
    .filter((row) => row.attributes['identity/session'] === 'true')
    .map((row) => {
      const attrs = row.attributes;
      const id = requiredString(attrs['identity/id'], 'identity.id');
      return {
        id,
        strandId: row.id,
        harness: requiredString(attrs['identity/harness'], 'identity.harness'),
        model: nullableString(attrs['identity/model'], 'identity.model'),
        effort: nullableString(attrs['identity/thinking-level'], 'identity.effort'),
        createdAt: requiredString(row.createdAt, 'identity.createdAt'),
        runs: sorted(
          runs.get(id) ?? [],
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        ),
        work: work.get(id) ?? [],
      };
    });
}
