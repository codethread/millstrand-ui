import type { AgentIdentity, AgentRun, AgentWork, JsonValue } from '../shared/api.ts';
import { sorted } from '../shared/array.ts';
import { z } from 'zod';
import { jsonObjectSchema } from './parse.ts';

const strandStateSchema = z.enum(['active', 'closed', 'replaced']);
const runStatusSchema = z.enum(['ready', 'running', 'stopped', 'failed']);
const runSubstatusSchema = z
  .enum([
    'pending',
    'completed',
    'requested',
    'abandoned',
    'bootstrap',
    'launch',
    'execution',
    'reconciliation',
  ])
  .nullable()
  .optional();
const agentStrandSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    state: strandStateSchema,
    attributes: jsonObjectSchema,
    created_at: z.string(),
    updated_at: z.string().optional(),
  })
  .loose();
const agentStrandsSchema = z.compile(z.array(agentStrandSchema), { strict: true });
const publishedRunAttributesSchema = z
  .object({
    'harness/run': z.literal('true'),
    'harness/published': z.literal('true'),
    'identity/id': z.string(),
    'harness/request-id': z.string().optional(),
    'harness/alias': z.string(),
    'harness/harness': z.string(),
    'harness/status': runStatusSchema,
    'harness/substatus': runSubstatusSchema,
    'harness/mode': z.enum(['headless', 'interactive']),
    'harness/model': z.string().optional(),
    'harness/effort': z.string().optional(),
    'harness/cwd': z.string().optional(),
    'harness/target': z.string().optional(),
    'harness/root-targets': z.array(z.string()).optional(),
    'harness/started-at': z.string().optional(),
    'harness/finished-at': z.string().optional(),
  })
  .loose();
const identityAttributesSchema = z
  .object({
    'identity/session': z.literal('true'),
    'identity/id': z.string(),
    'identity/harness': z.string(),
    'identity/model': z.string().optional(),
    'identity/thinking-level': z.string().optional(),
  })
  .loose();
const ownedWorkAttributesSchema = z
  .object({
    owner: z.string(),
    'kanban/card': z.literal('true').optional(),
    'kanban/task': z.literal('true').optional(),
  })
  .loose();

type AgentStrand = z.infer<typeof agentStrandSchema>;

function parseSchema<T>(schema: z.ZodType<T>, value: unknown, where: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${where} is invalid: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

function parseAgentStrand(value: AgentStrand): {
  id: string;
  title: string;
  state: string;
  attributes: Record<string, JsonValue>;
  createdAt: string;
} {
  return {
    id: value.id,
    title: value.title,
    state: value.state,
    attributes: value.attributes,
    createdAt: value.created_at,
  };
}

/** List projections omit large prompt/result values. Only expose inspection fields,
 * never provider environment, injected prompts, or credentials through this API. */
export function parseAgents(value: unknown): AgentIdentity[] {
  const rows = parseSchema(agentStrandsSchema, value, 'agent strands').map(parseAgentStrand);
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
      const runAttrs = parseSchema(publishedRunAttributesSchema, attrs, `run ${row.id}`);
      const identity = runAttrs['identity/id'];
      const run: AgentRun = {
        id: row.id,
        requestId: runAttrs['harness/request-id'] ?? null,
        title: row.title,
        alias: runAttrs['harness/alias'],
        harness: runAttrs['harness/harness'],
        status: runAttrs['harness/status'],
        substatus: runAttrs['harness/substatus'] ?? null,
        mode: runAttrs['harness/mode'],
        model: runAttrs['harness/model'] ?? null,
        effort: runAttrs['harness/effort'] ?? null,
        cwd: runAttrs['harness/cwd'] ?? null,
        target: runAttrs['harness/target'] ?? null,
        rootTargets: runAttrs['harness/root-targets'] ?? [],
        createdAt: row.createdAt,
        startedAt: runAttrs['harness/started-at'] ?? null,
        finishedAt: runAttrs['harness/finished-at'] ?? null,
      };
      runs.set(identity, [...(runs.get(identity) ?? []), run]);
    }
    if (attrs['owner'] !== undefined) {
      const workAttrs = parseSchema(ownedWorkAttributesSchema, attrs, `owned work ${row.id}`);
      const owner = workAttrs.owner;
      work.set(owner, [
        ...(work.get(owner) ?? []),
        {
          id: row.id,
          title: row.title,
          state: row.state,
          kind:
            workAttrs['kanban/card'] === 'true'
              ? 'card'
              : workAttrs['kanban/task'] === 'true'
                ? 'task'
                : 'work',
        },
      ]);
    }
  }
  return rows
    .filter((row) => row.attributes['identity/session'] === 'true')
    .map((row) => {
      const attrs = parseSchema(identityAttributesSchema, row.attributes, `identity ${row.id}`);
      const id = attrs['identity/id'];
      return {
        id,
        strandId: row.id,
        harness: attrs['identity/harness'],
        model: attrs['identity/model'] ?? null,
        effort: attrs['identity/thinking-level'] ?? null,
        createdAt: row.createdAt,
        runs: sorted(
          runs.get(id) ?? [],
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        ),
        work: work.get(id) ?? [],
      };
    });
}
