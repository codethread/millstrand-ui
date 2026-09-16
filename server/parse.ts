import type {
  Card,
  CardGraph,
  GraphEdge,
  GraphNode,
  JsonValue,
  LabelChange,
  LabelTerm,
  Lane,
  Note,
  Relation,
  SavedView,
  Task,
  ViewFilter,
  WorkItem,
} from '../shared/api.ts';
import { sorted } from '../shared/array.ts';
import { z } from 'zod';

type ObjectValue = Record<string, JsonValue>;

const lanes = [
  'refinement',
  'pending',
  'claimed',
  'in_review',
  'in_production',
  'closed',
  'unknown',
] as const;
const priorities = ['p1', 'p2', 'p3', 'p4'] as const;
const cardTypes = ['epic', 'feature'] as const;
const taskStatuses = ['ready', 'doing', 'blocked', 'closed'] as const;
const relationKinds = ['depends-on', 'depended-on-by'] as const;
const labelActions = ['add', 'remove'] as const;
const labelTerms = ['include', 'exclude'] as const;

const laneSchema = z.enum(lanes);
const prioritySchema = z.enum(priorities);
const cardTypeSchema = z.enum(cardTypes);
const taskStatusSchema = z.enum(taskStatuses);
const relationKindSchema = z.enum(relationKinds);
const labelActionSchema = z.enum(labelActions);
const labelTermSchema = z.enum(labelTerms);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isObject(value) && Object.entries(value).every(([, item]) => isJsonValue(item));
}

// Zod records intentionally omit an own "__proto__" key while building their
// output object. Keep generic JSON objects as custom schemas so parsed data
// retains every JSON key; in particular, attributes must not lose that key.
const jsonValueSchema = z.custom<JsonValue>(isJsonValue);
const jsonObjectSchema = z.custom<Record<string, JsonValue>>(
  (value): value is Record<string, JsonValue> => isObject(value) && isJsonValue(value),
);
const objectSchema = z.custom<Record<string, unknown>>(isObject);

const unknownArraySchema = z.compile(z.array(z.unknown()), { strict: true });
const stringSchema = z.compile(z.string(), { strict: true });
const nullableStringSchema = z.compile(z.string().nullable().optional(), { strict: true });

const noteSchema = z
  .object({
    id: z.string(),
    note: z.string(),
    at: z.string(),
    by: z.string().nullable().optional(),
    kind: z.string().nullable().optional(),
    truncated: z.boolean().optional(),
  })
  .loose();
const compiledNoteSchema = z.compile(noteSchema, { strict: true });

const cardSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable().optional(),
    state: z.string(),
    attributes: z.unknown().optional(),
    lane: z.unknown().optional(),
    labels: z.array(z.string()).optional(),
    epic: z.string().nullable().optional(),
    type: z.unknown().optional(),
    priority: z.unknown().optional(),
    owner: z.unknown().optional(),
    branch: z.unknown().optional(),
    worktree: z.unknown().optional(),
    source: z.unknown().optional(),
    outcome: z.unknown().optional(),
    created_at: z.string(),
    updated_at: z.string().nullable().optional(),
  })
  .loose();
const compiledCardSchema = z.compile(cardSchema, { strict: true });
type CardRow = z.infer<typeof cardSchema>;
const taskSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable().optional(),
    state: z.string(),
    status: taskStatusSchema,
    owner: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    'latest-note': noteSchema.optional(),
  })
  .loose();
const compiledTaskSchema = z.compile(taskSchema, { strict: true });
const workSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable().optional(),
    state: z.string(),
    attributes: z.unknown(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .loose();
const compiledWorkSchema = z.compile(workSchema, { strict: true });
const relationSchema = z
  .object({
    relation: relationKindSchema,
    strand: workSchema,
  })
  .loose();
const compiledRelationSchema = z.compile(relationSchema, { strict: true });
const edgeSchema = z
  .object({
    from_strand_id: z.string(),
    to_strand_id: z.string(),
  })
  .loose();
type EdgeRow = z.infer<typeof edgeSchema>;
const graphSchema = z
  .object({
    'root-id': z.string(),
    strands: z.array(workSchema),
    'parent-of-edges': z.array(edgeSchema),
    'depends-on-edges': z.array(edgeSchema),
  })
  .loose();
const compiledGraphSchema = z.compile(graphSchema, { strict: true });
const labelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]*$/);
const compiledLabelSchema = z.compile(labelSchema, { strict: true });

const labelChangeSchema = z
  .object({
    action: labelActionSchema,
    labels: z.array(z.string()),
  })
  .loose();
const compiledLabelChangeSchema = z.compile(labelChangeSchema, { strict: true });
const viewFilterSchema = z
  .object({
    query: z.string(),
    mode: z.enum(['and', 'or']),
    terms: z.unknown(),
    lanes: z.array(laneSchema),
    types: z.array(cardTypeSchema),
    priorities: z.array(prioritySchema),
    includeClosed: z.boolean(),
  })
  .loose();
const compiledViewFilterSchema = z.compile(viewFilterSchema, { strict: true });
const viewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    filter: viewFilterSchema,
  })
  .loose();
const savedViewsSchema = z.array(viewSchema);
const compiledSavedViewsSchema = z.compile(savedViewsSchema, { strict: true });
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  where: string,
  message = `${where} is invalid`,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(message);
  return parsed.data;
}

export function object(value: unknown, where: string): ObjectValue {
  const parsed = parseSchema(objectSchema, value, where, `${where} must be an object`);
  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, item]) =>
      item === undefined ? [] : [[key, parseSchema(jsonValueSchema, item, `${where}.${key}`)]],
    ),
  );
}

export function array(value: unknown, where: string): unknown[] {
  return parseSchema(unknownArraySchema, value, where, `${where} must be an array`);
}

function jsonObject(value: unknown, where: string): Record<string, JsonValue> {
  return parseSchema(jsonObjectSchema, value, where, `${where} must be an object`);
}

export function string(value: unknown, where: string): string {
  return parseSchema(stringSchema, value, where, `${where} must be a string`);
}

export function maybeString(value: unknown, where: string): string | null {
  return parseSchema(nullableStringSchema, value, where, `${where} must be a string`) ?? null;
}

function enumValue<T extends string>(
  schema: z.ZodType<T>,
  value: unknown,
  allowed: readonly T[],
  where: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${where} must be one of: ${allowed.join(', ')}`);
  return parsed.data;
}

export function parseCard(value: unknown): Card {
  const row = parseSchema(compiledCardSchema, value, 'card');
  const attrs = row.attributes === undefined ? {} : jsonObject(row.attributes, 'card.attributes');
  const read = (key: keyof CardRow, attr = key): unknown => row[key] ?? attrs[attr];
  const sourceLane = read('lane', 'kanban/lane');
  const lane: Lane =
    row.state === 'closed' ? 'closed' : (lanes.find((item) => item === sourceLane) ?? 'unknown');
  const labels =
    row.labels === undefined
      ? Object.entries(attrs)
          .filter(([key, flag]) => key.startsWith('kanban.label/') && flag === 'true')
          .map(([key]) => key.slice('kanban.label/'.length))
      : row.labels;
  return {
    id: row.id,
    title: row.title ?? '(untitled)',
    // These are the spool's documented defaults for cards predating these attributes.
    type: enumValue(
      cardTypeSchema,
      read('type', 'kanban/type') ?? 'feature',
      cardTypes,
      'card.type',
    ),
    state: row.state,
    lane,
    priority: enumValue(
      prioritySchema,
      read('priority', 'kanban/priority') ?? 'p3',
      priorities,
      'card.priority',
    ),
    epicId: row.epic ?? null,
    owner: maybeString(read('owner'), 'card.owner'),
    branch: maybeString(read('branch'), 'card.branch'),
    worktree: maybeString(read('worktree'), 'card.worktree'),
    source: maybeString(read('source', 'kanban/source'), 'card.source'),
    outcome: maybeString(read('outcome', 'kanban/outcome'), 'card.outcome'),
    labels: sorted([...new Set(labels)]),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

export function parseNote(value: unknown): Note {
  const row = parseSchema(compiledNoteSchema, value, 'note');
  return {
    id: row.id,
    text: row.note,
    at: row.at,
    by: row.by ?? null,
    kind: row.kind ?? null,
    truncated: row.truncated === true,
  };
}

export function parseTask(value: unknown): Task {
  const row = parseSchema(compiledTaskSchema, value, 'task');
  return {
    id: row.id,
    title: row.title ?? '(untitled)',
    state: row.state,
    status: row.status,
    owner: row.owner ?? null,
    body: row.body ?? '',
    latestNote: row['latest-note'] === undefined ? null : parseNote(row['latest-note']),
  };
}

export function parseWork(value: unknown): WorkItem {
  const row = parseSchema(compiledWorkSchema, value, 'work');
  return {
    id: row.id,
    title: row.title ?? '(untitled)',
    state: row.state,
    attributes: jsonObject(row.attributes, 'work.attributes'),
    // Compact entity projections (active work and related strands) omit timestamps.
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function parseRelation(value: unknown): Relation {
  const row = parseSchema(compiledRelationSchema, value, 'relation');
  return { kind: row.relation, item: parseWork(row.strand) };
}

function graphEdges(items: EdgeRow[], kind: GraphEdge['kind']): GraphEdge[] {
  return items.map((edge) => ({ kind, from: edge.from_strand_id, to: edge.to_strand_id }));
}

export function parseGraph(value: unknown): CardGraph {
  const row = parseSchema(compiledGraphSchema, value, 'graph');
  const nodes = row.strands.map((item): GraphNode => {
    const work = parseWork(item);
    const cardType =
      work.attributes['kanban/type'] ??
      (work.attributes['kanban/card'] === 'true' ? 'feature' : null);
    const kind =
      cardType === 'epic' || cardType === 'feature'
        ? cardType
        : work.attributes['kanban/task'] === 'true'
          ? 'task'
          : 'work';
    return { ...work, kind };
  });
  return {
    rootId: row['root-id'],
    nodes,
    edges: [
      ...graphEdges(row['parent-of-edges'], 'parent-of'),
      ...graphEdges(row['depends-on-edges'], 'depends-on'),
    ],
  };
}

const labelError =
  'Labels must contain lowercase letters, numbers and hyphens, starting with a letter or number.';

function label(value: string): string {
  const parsed = compiledLabelSchema.safeParse(value);
  if (!parsed.success) throw new Error(labelError);
  return parsed.data;
}

export function parseLabelChange(value: unknown): LabelChange {
  const row = parseSchema(compiledLabelChangeSchema, value, 'label change');
  const labels = [...new Set(row.labels.map(label))];
  if (labels.length === 0 || labels.length > 100)
    throw new Error('Supply between 1 and 100 labels.');
  return { action: row.action, labels };
}

function parseFilter(value: unknown): ViewFilter {
  const row = parseSchema(compiledViewFilterSchema, value, 'view.filter');
  const terms: Record<string, LabelTerm> = {};
  for (const [key, term] of Object.entries(object(row.terms, 'view.filter.terms'))) {
    terms[label(key)] = enumValue(labelTermSchema, term, labelTerms, 'label term');
  }
  return {
    query: row.query,
    mode: row.mode,
    terms,
    lanes: row.lanes,
    types: row.types,
    priorities: row.priorities,
    includeClosed: row.includeClosed,
  };
}

export function parseViews(value: unknown): SavedView[] {
  const rows = parseSchema(compiledSavedViewsSchema, value, 'views');
  const views = rows.map((row): SavedView => {
    const id = row.id;
    const name = row.name.trim();
    if (id.length === 0 || id.length > 100)
      throw new Error('View IDs must contain 1 to 100 characters.');
    if (name.length === 0 || name.length > 80)
      throw new Error('View names must contain 1 to 80 characters.');
    return { id, name, filter: parseFilter(row.filter) };
  });
  if (views.length > 100) throw new Error('Save at most 100 views.');
  if (new Set(views.map((view) => view.id)).size !== views.length)
    throw new Error('View IDs must be unique.');
  return views;
}

export function requestValue<T>(parse: (value: unknown) => T, value: unknown): T {
  try {
    return parse(value);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid request.');
  }
}

/** Recognize observed machine-readable CLI errors; retain diagnostics for every other failure. */
export function strandErrorMessage(stderr: string, fallback: string): string {
  try {
    const error = object(JSON.parse(stderr) as unknown, 'strand error');
    const details = object(error['details'], 'strand error.details');
    if (
      error['code'] === 'domain/error' &&
      error['message'] === 'Operation not found' &&
      details['canonical-operation'] === 'kanban'
    ) {
      return 'This weaver does not publish Kanban. Choose another workspace or enable the Kanban spool.';
    }
    if (
      error['code'] === 'mill/invoke-world-failed' &&
      error['message'] === 'invoke world resolution failed' &&
      typeof details['detail'] === 'string' &&
      /^client config .+\/config\.json is required; run mill init for the selected world$/.test(
        details['detail'],
      )
    ) {
      return 'This weaver’s workspace configuration is unavailable. Choose another workspace or restore its configuration.';
    }
  } catch {
    // Process termination and executable failures do not produce a JSON error envelope.
    return fallback;
  }
  return fallback;
}
