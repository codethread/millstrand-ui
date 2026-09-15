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
  Priority,
  Relation,
  SavedView,
  Task,
  ViewFilter,
  WorkItem,
} from '../shared/api.ts';
import { sorted } from '../shared/array.ts';

type ObjectValue = Record<string, JsonValue>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function object(value: unknown, where: string): ObjectValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

export function array(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${where} must be an array`);
  return value.map((item) => item);
}

function jsonValue(value: unknown, where: string): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  if (Array.isArray(value)) return value.map((item) => jsonValue(item, where));
  const row = object(value, where);
  return Object.fromEntries(
    Object.entries(row).flatMap(([key, item]) =>
      item === undefined ? [] : [[key, jsonValue(item, `${where}.${key}`)]],
    ),
  );
}

function jsonObject(value: unknown, where: string): Record<string, JsonValue> {
  const parsed = jsonValue(value, where);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')
    throw new Error(`${where} must be an object`);
  return parsed;
}

export function string(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new Error(`${where} must be a string`);
  return value;
}

export function maybeString(value: unknown, where: string): string | null {
  return value === undefined || value === null ? null : string(value, where);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  const found = allowed.find((item) => item === value);
  if (found === undefined) throw new Error(`${where} must be one of: ${allowed.join(', ')}`);
  return found;
}

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

export function parseCard(value: unknown): Card {
  const row = object(value, 'card');
  const attrs = row['attributes'] === undefined ? {} : object(row['attributes'], 'card.attributes');
  const read = (key: string, attr = key): JsonValue | undefined => row[key] ?? attrs[attr];
  const state = string(row['state'], 'card.state');
  const sourceLane = read('lane', 'kanban/lane');
  const lane: Lane =
    state === 'closed' ? 'closed' : (lanes.find((item) => item === sourceLane) ?? 'unknown');
  const labels =
    row['labels'] === undefined
      ? Object.entries(attrs)
          .filter(([key, flag]) => key.startsWith('kanban.label/') && flag === 'true')
          .map(([key]) => key.slice('kanban.label/'.length))
      : array(row['labels'], 'card.labels').map((item) => string(item, 'card.labels item'));
  return {
    id: string(row['id'], 'card.id'),
    title: maybeString(row['title'], 'card.title') ?? '(untitled)',
    // These are the spool's documented defaults for cards predating these attributes.
    type: oneOf(read('type', 'kanban/type') ?? 'feature', cardTypes, 'card.type'),
    state,
    lane,
    priority: oneOf(read('priority', 'kanban/priority') ?? 'p3', priorities, 'card.priority'),
    epicId: maybeString(row['epic'], 'card.epic'),
    owner: maybeString(read('owner'), 'card.owner'),
    branch: maybeString(read('branch'), 'card.branch'),
    worktree: maybeString(read('worktree'), 'card.worktree'),
    source: maybeString(read('source', 'kanban/source'), 'card.source'),
    outcome: maybeString(read('outcome', 'kanban/outcome'), 'card.outcome'),
    labels: sorted([...new Set(labels)]),
    createdAt: string(row['created_at'], 'card.created_at'),
    updatedAt: maybeString(row['updated_at'], 'card.updated_at'),
  };
}

export function parseNote(value: unknown): Note {
  const row = object(value, 'note');
  return {
    id: string(row['id'], 'note.id'),
    text: string(row['note'], 'note.note'),
    at: string(row['at'], 'note.at'),
    by: maybeString(row['by'], 'note.by'),
    kind: maybeString(row['kind'], 'note.kind'),
    truncated: row['truncated'] === true,
  };
}

export function parseTask(value: unknown): Task {
  const row = object(value, 'task');
  return {
    id: string(row['id'], 'task.id'),
    title: maybeString(row['title'], 'task.title') ?? '(untitled)',
    state: string(row['state'], 'task.state'),
    status: oneOf(row['status'], ['ready', 'doing', 'blocked', 'closed'], 'task.status'),
    owner: maybeString(row['owner'], 'task.owner'),
    body: maybeString(row['body'], 'task.body') ?? '',
    latestNote: row['latest-note'] === undefined ? null : parseNote(row['latest-note']),
  };
}

export function parseWork(value: unknown): WorkItem {
  const row = object(value, 'work');
  return {
    id: string(row['id'], 'work.id'),
    title: maybeString(row['title'], 'work.title') ?? '(untitled)',
    state: string(row['state'], 'work.state'),
    attributes: jsonObject(row['attributes'], 'work.attributes'),
    // Compact entity projections (active work and related strands) omit timestamps.
    createdAt: maybeString(row['created_at'], 'work.created_at'),
    updatedAt: maybeString(row['updated_at'], 'work.updated_at'),
  };
}

export function parseRelation(value: unknown): Relation {
  const row = object(value, 'relation');
  const kind = oneOf(row['relation'], ['depends-on', 'depended-on-by'], 'relation.relation');
  return { kind, item: parseWork(row['strand']) };
}

export function parseGraph(value: unknown): CardGraph {
  const row = object(value, 'graph');
  const nodes = array(row['strands'], 'graph.strands').map((item): GraphNode => {
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
  const edges = (key: string, kind: GraphEdge['kind']): GraphEdge[] =>
    array(row[key], `graph.${key}`).map((item) => {
      const edge = object(item, 'edge');
      return {
        kind,
        from: string(edge['from_strand_id'], 'edge.from_strand_id'),
        to: string(edge['to_strand_id'], 'edge.to_strand_id'),
      };
    });
  return {
    rootId: string(row['root-id'], 'graph.root-id'),
    nodes,
    edges: [...edges('parent-of-edges', 'parent-of'), ...edges('depends-on-edges', 'depends-on')],
  };
}

function label(value: unknown): string {
  const normalized = string(value, 'label').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    throw new Error(
      'Labels must contain lowercase letters, numbers and hyphens, starting with a letter or number.',
    );
  }
  return normalized;
}

export function parseLabelChange(value: unknown): LabelChange {
  const row = object(value, 'label change');
  const action = oneOf(row['action'], ['add', 'remove'], 'label change.action');
  const labels = [...new Set(array(row['labels'], 'label change.labels').map(label))];
  if (labels.length === 0 || labels.length > 100)
    throw new Error('Supply between 1 and 100 labels.');
  return { action, labels };
}

function parseFilter(value: unknown): ViewFilter {
  const row = object(value, 'view.filter');
  const terms: Record<string, LabelTerm> = {};
  for (const [key, term] of Object.entries(object(row['terms'], 'view.filter.terms'))) {
    terms[label(key)] = oneOf(term, ['include', 'exclude'], 'label term');
  }
  if (typeof row['includeClosed'] !== 'boolean')
    throw new Error('view.filter.includeClosed must be boolean');
  return {
    query: string(row['query'], 'view.filter.query'),
    mode: oneOf(row['mode'], ['and', 'or'], 'view.filter.mode'),
    terms,
    lanes: array(row['lanes'], 'view.filter.lanes').map((item): Lane => oneOf(item, lanes, 'lane')),
    types: array(row['types'], 'view.filter.types').map((item) => oneOf(item, cardTypes, 'type')),
    priorities: array(row['priorities'], 'view.filter.priorities').map((item): Priority =>
      oneOf(item, priorities, 'priority'),
    ),
    includeClosed: row['includeClosed'],
  };
}

export function parseViews(value: unknown): SavedView[] {
  const views = array(value, 'views').map((item): SavedView => {
    const row = object(item, 'view');
    const id = string(row['id'], 'view.id');
    const name = string(row['name'], 'view.name').trim();
    if (id.length === 0 || id.length > 100)
      throw new Error('View IDs must contain 1 to 100 characters.');
    if (name.length === 0 || name.length > 80)
      throw new Error('View names must contain 1 to 80 characters.');
    return { id, name, filter: parseFilter(row['filter']) };
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
