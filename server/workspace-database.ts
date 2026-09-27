import { countDependencies } from '../shared/dependencies.ts';
import { execFile } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { basename, dirname, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { HttpError, parseGraph } from './parse.ts';
import { recordPerf } from './perf.ts';
import type { CardGraph, DependencyCounts } from '../shared/api.ts';

const exec = promisify(execFile);
const edgeLimit = 50_000;
const supportedSchemaVersion = 1;
// The weaver's file-backed database moves only across restarts or reconfiguration.
const discoveryLifetime = 30_000;
const weaverStatusesSchema = z.compile(
  z.array(
    z
      .object({
        config_dir: z.string(),
        database_kind: z.string(),
        database_label: z.string(),
        database_path: z.string().nullable(),
      })
      .loose(),
  ),
  { strict: true },
);
const databaseRowsSchema = z.compile(z.array(z.object({ record: z.string() })), { strict: true });
const persistedRecordSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('strand'),
    id: z.string(),
    title: z.string(),
    state: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    attributes: z.unknown(),
  }),
  z.object({
    kind: z.literal('edge'),
    from_strand_id: z.string(),
    to_strand_id: z.string(),
    edge_type: z.string(),
  }),
]);
const schemaVersionSchema = z.object({ user_version: z.literal(supportedSchemaVersion) });
/** Allowlisted persisted fields. Prompts, results, environments and credentials never enter the API. */
const provenanceAttributeKeys = [
  'identity/session',
  'identity/id',
  'identity/harness',
  'identity/native-session-id',
  'identity/model',
  'identity/thinking-level',
  'identity/by-identity',
  'harness/run',
  'harness/published',
  'harness/request-id',
  'harness/session-id',
  'harness/alias',
  'harness/harness',
  'harness/status',
  'harness/substatus',
  'harness/mode',
  'harness/observed-model',
  'harness/observed-effort',
  'harness/ownership',
  'harness/cwd',
  'harness/started-at',
  'harness/finished-at',
  'kanban/card',
  'kanban/task',
  'kanban/type',
  'kanban/lane',
  'kanban/priority',
  'kanban/source',
  'kanban/outcome',
  'kanban/reporter',
  'kanban/ownership-claim',
  'kanban/owner',
  'kanban/claimed-at',
  'kanban/run-id',
  'branch',
  'worktree',
  'auto-run/seat',
  'auto-run/effort',
  'auto-run/workflow',
  'auto-run/status',
  'auto-run/run-id',
  'auto-run/workflow-run-id',
  'auto-run/error',
  'auto-run/worktree',
  'auto-run/branch',
] as const;
const provenanceEdgeKinds = [
  'reported',
  'claimed',
  'attributed',
  'performed',
  'claims',
  'serves',
  'serves-root',
  'resumes',
  'continues',
  'parent-of',
  'depends-on',
] as const;
function placeholders(values: readonly string[]): string {
  return values.map(() => '?').join(', ');
}

const provenanceSql = `
  WITH candidate_ids(strand_id) AS (
    SELECT DISTINCT marker.strand_id
    FROM attributes AS marker
    WHERE marker.archived = 0
      AND (
        (marker.key IN (
          'identity/session',
          'kanban/card',
          'kanban/task',
          'kanban/ownership-claim'
        ) AND marker.value = '"true"')
        OR (
          marker.key = 'harness/run'
          AND marker.value = '"true"'
          AND EXISTS (
            SELECT 1
            FROM attributes AS published
            WHERE published.strand_id = marker.strand_id
              AND published.archived = 0
              AND published.key = 'harness/published'
              AND published.value = '"true"'
          )
        )
      )
    ORDER BY marker.strand_id
  ),
  candidate_strands AS (
    SELECT strands.id,
           strands.title,
           strands.state,
           strands.created_at,
           strands.updated_at
    FROM candidate_ids
    JOIN strands ON strands.id = candidate_ids.strand_id
  ),
  projected_strands AS (
    SELECT json_object(
             'kind', 'strand',
             'id', candidate_strands.id,
             'title', candidate_strands.title,
             'state', candidate_strands.state,
             'created_at', candidate_strands.created_at,
             'updated_at', candidate_strands.updated_at,
             'attributes', json(COALESCE(
               (
                 SELECT json_group_object(attributes.key, json(attributes.value))
                 FROM attributes
                 WHERE attributes.strand_id = candidate_strands.id
                   AND attributes.archived = 0
                   AND (
                     attributes.key IN (${placeholders(provenanceAttributeKeys)})
                     OR attributes.key LIKE 'kanban.label/%'
                   )
               ),
               '{}'
             ))
           ) AS record
    FROM candidate_strands
    ORDER BY candidate_strands.id
  ),
  projected_edges AS (
    SELECT json_object(
             'kind', 'edge',
             'from_strand_id', strand_edges.from_strand_id,
             'to_strand_id', strand_edges.to_strand_id,
             'edge_type', strand_edges.edge_type
           ) AS record
    FROM strand_edges
    WHERE strand_edges.edge_type IN (${placeholders(provenanceEdgeKinds)})
      AND (
        strand_edges.edge_type = 'depends-on'
        OR strand_edges.from_strand_id IN (SELECT strand_id FROM candidate_ids)
        OR strand_edges.to_strand_id IN (SELECT strand_id FROM candidate_ids)
      )
      AND (
        strand_edges.edge_type <> 'parent-of'
        OR (
          EXISTS (
            SELECT 1 FROM attributes AS parent_card
            WHERE parent_card.strand_id = strand_edges.from_strand_id
              AND parent_card.archived = 0
              AND parent_card.key = 'kanban/card'
              AND parent_card.value = '"true"'
          )
          AND (
            EXISTS (
              SELECT 1 FROM attributes AS child_task
              WHERE child_task.strand_id = strand_edges.to_strand_id
                AND child_task.archived = 0
                AND child_task.key = 'kanban/task'
                AND child_task.value = '"true"'
            )
            OR EXISTS (
              SELECT 1 FROM attributes AS child_card
              WHERE child_card.strand_id = strand_edges.to_strand_id
                AND child_card.archived = 0
                AND child_card.key = 'kanban/card'
                AND child_card.value = '"true"'
            )
          )
        )
        OR (
          EXISTS (
            SELECT 1 FROM attributes AS parent_identity
            WHERE parent_identity.strand_id = strand_edges.from_strand_id
              AND parent_identity.archived = 0
              AND parent_identity.key = 'identity/session'
              AND parent_identity.value = '"true"'
          )
          AND EXISTS (
            SELECT 1 FROM attributes AS child_identity
            WHERE child_identity.strand_id = strand_edges.to_strand_id
              AND child_identity.archived = 0
              AND child_identity.key = 'identity/session'
              AND child_identity.value = '"true"'
          )
        )
      )
    LIMIT ${edgeLimit + 1}
  )
  SELECT record FROM projected_strands
  UNION ALL
  SELECT record FROM projected_edges
`;

// Requested note IDs plus only the identity records needed to attribute their authors.
const noteProvenanceSql = `
  WITH requested_notes(strand_id) AS (
    SELECT value FROM json_each(?)
  ),
  actor_values(value) AS (
    SELECT DISTINCT actor.value
    FROM attributes AS actor
    JOIN requested_notes ON requested_notes.strand_id = actor.strand_id
    WHERE actor.archived = 0
      AND actor.key = 'identity/by-identity'
  ),
  candidate_ids(strand_id) AS (
    SELECT strand_id FROM requested_notes
    UNION
    SELECT source.from_strand_id
    FROM strand_edges AS source
    JOIN requested_notes ON requested_notes.strand_id = source.to_strand_id
    WHERE source.edge_type = 'attributed'
    UNION
    SELECT identity_id.strand_id
    FROM attributes AS identity_id
    JOIN actor_values ON actor_values.value = identity_id.value
    WHERE identity_id.archived = 0
      AND identity_id.key = 'identity/id'
      AND EXISTS (
        SELECT 1
        FROM attributes AS marker
        WHERE marker.strand_id = identity_id.strand_id
          AND marker.archived = 0
          AND marker.key = 'identity/session'
          AND marker.value = '"true"'
      )
  ),
  projected_strands AS (
    SELECT json_object(
             'kind', 'strand',
             'id', strands.id,
             'title', strands.title,
             'state', strands.state,
             'created_at', strands.created_at,
             'updated_at', strands.updated_at,
             'attributes', json(COALESCE(
               (
                 SELECT json_group_object(attributes.key, json(attributes.value))
                 FROM attributes
                 WHERE attributes.strand_id = strands.id
                   AND attributes.archived = 0
                   AND attributes.key IN (
                     'identity/session',
                     'identity/id',
                     'identity/harness',
                     'identity/native-session-id',
                     'identity/model',
                     'identity/thinking-level',
                     'identity/by-identity'
                   )
               ),
               '{}'
             ))
           ) AS record
    FROM strands
    JOIN candidate_ids ON candidate_ids.strand_id = strands.id
    ORDER BY strands.id
  ),
  projected_edges AS (
    SELECT json_object(
             'kind', 'edge',
             'from_strand_id', strand_edges.from_strand_id,
             'to_strand_id', strand_edges.to_strand_id,
             'edge_type', strand_edges.edge_type
           ) AS record
    FROM strand_edges
    JOIN requested_notes ON requested_notes.strand_id = strand_edges.to_strand_id
    WHERE strand_edges.edge_type = 'attributed'
    ORDER BY strand_edges.from_strand_id, strand_edges.to_strand_id
    LIMIT ${edgeLimit + 1}
  )
  SELECT record FROM projected_strands
  UNION ALL
  SELECT record FROM projected_edges
`;

// Only dependency endpoints and display metadata; never arbitrary attributes or run payloads.
function dependencySql(cardIds: readonly string[]): string {
  // Absent cards keep the workspace-wide read; the client always scopes to its expansions.
  const scope =
    cardIds.length === 0
      ? ''
      : ` AND (from_strand_id IN (${placeholders(cardIds)}) OR to_strand_id IN (${placeholders(
          cardIds,
        )}))`;
  return `
  WITH dependencies AS (
    SELECT DISTINCT from_strand_id, to_strand_id
    FROM strand_edges WHERE edge_type = 'depends-on'${scope}
    ORDER BY from_strand_id, to_strand_id LIMIT ${edgeLimit + 1}
  ), endpoints AS (
    SELECT from_strand_id AS id FROM dependencies
    UNION SELECT to_strand_id AS id FROM dependencies
  ), nodes AS (
    SELECT json_object(
      'kind', 'strand', 'id', s.id, 'title', s.title, 'state', s.state,
      'created_at', s.created_at, 'updated_at', s.updated_at,
      'attributes', json(COALESCE((
        SELECT json_group_object(a.key, json(a.value)) FROM attributes a
        WHERE a.strand_id = s.id AND a.archived = 0
          AND a.key IN ('kanban/type', 'kanban/card', 'kanban/task', 'kanban/lane')
      ), '{}'))
    ) AS record FROM strands s JOIN endpoints ON endpoints.id = s.id
    ORDER BY s.id
  )
  SELECT record FROM nodes
  UNION ALL
  SELECT json_object('kind', 'edge', 'from_strand_id', from_strand_id,
    'to_strand_id', to_strand_id, 'edge_type', 'depends-on') FROM dependencies
`;
}

/** Workspace-wide directed counts for the returned endpoints, so neighbour badges stay truthful. */
const dependencyCountsSql = `
  WITH ids(id) AS (SELECT value FROM json_each(?)),
  incoming AS (
    SELECT strand_edges.to_strand_id AS id, count(*) AS total
    FROM strand_edges JOIN ids ON ids.id = strand_edges.to_strand_id
    WHERE strand_edges.edge_type = 'depends-on'
    GROUP BY strand_edges.to_strand_id
  ),
  outgoing AS (
    SELECT strand_edges.from_strand_id AS id, count(*) AS total
    FROM strand_edges JOIN ids ON ids.id = strand_edges.from_strand_id
    WHERE strand_edges.edge_type = 'depends-on'
    GROUP BY strand_edges.from_strand_id
  )
  SELECT json_object(
    'id', ids.id,
    'incoming', COALESCE(incoming.total, 0),
    'outgoing', COALESCE(outgoing.total, 0)
  ) AS record
  FROM ids
  LEFT JOIN incoming ON incoming.id = ids.id
  LEFT JOIN outgoing ON outgoing.id = ids.id
`;

const dependencyCountSchema = z.compile(
  z.object({ id: z.string(), incoming: z.number(), outgoing: z.number() }),
  { strict: true },
);

interface ReadonlyDatabase {
  configure(): void;
  schemaVersion(): unknown;
  all(sql: string, parameters: readonly string[]): unknown[];
  close(): void;
}

type DiscoverDatabase = (workspace: string) => Promise<string>;
type OpenDatabase = (path: string) => ReadonlyDatabase;

export function parseDatabasePath(value: unknown, workspace: string): string {
  const parsed = weaverStatusesSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Mill returned invalid weaver storage metadata.`);
  const status = parsed.data.find((candidate) => candidate.config_dir === workspace);
  if (status === undefined) throw new Error(`Mill does not know workspace ${workspace}`);
  if (status.database_kind !== 'sqlite-file' || status.database_path === null)
    throw new Error(`Workspace storage is not file-backed SQLite: ${status.database_kind}`);
  if (!isAbsolute(status.database_path) || status.database_label !== status.database_path)
    throw new Error(`Workspace SQLite storage metadata is inconsistent.`);
  return status.database_path;
}

async function discoverDatabase(workspace: string): Promise<string> {
  const started = performance.now();
  const { stdout } = await exec('mill', ['weaver', 'list'], {
    cwd: dirname(workspace),
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
    encoding: 'utf8',
  });
  recordPerf({
    scope: 'mill',
    target: 'weaver list (storage)',
    workspace: basename(dirname(workspace)),
    ms: performance.now() - started,
    detail: `bytes=${Buffer.byteLength(stdout)}`,
  });
  return parseDatabasePath(JSON.parse(stdout) as unknown, workspace);
}

function openDatabase(path: string): ReadonlyDatabase {
  const database = new DatabaseSync(path, { readOnly: true });
  return {
    configure: () => database.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 1000;'),
    schemaVersion: () => database.prepare('PRAGMA user_version').get(),
    all: (sql, parameters) => database.prepare(sql).all(...parameters),
    close: () => database.close(),
  };
}

function decodeProvenance(value: unknown) {
  const records = databaseRowsSchema
    .parse(value)
    .map(({ record }) => persistedRecordSchema.parse(JSON.parse(record) as unknown));
  const strands = records.filter((record) => record.kind === 'strand');
  const edges = records.filter((record) => record.kind === 'edge');
  if (edges.length > edgeLimit)
    throw new Error(`Provenance inspection matched more than ${edgeLimit} role edges.`);
  return {
    strands: strands.map((record) => ({
      id: record.id,
      title: record.title,
      state: record.state,
      created_at: record.created_at,
      updated_at: record.updated_at,
      attributes: record.attributes,
    })),
    edges: edges.map((record) => ({
      from_strand_id: record.from_strand_id,
      to_strand_id: record.to_strand_id,
      edge_type: record.edge_type,
    })),
  };
}

function decodeDependencyCounts(value: unknown): Map<string, DependencyCounts> {
  const records = databaseRowsSchema.parse(value);
  return new Map(
    records.map(({ record }) => {
      const count = dependencyCountSchema.parse(JSON.parse(record) as unknown);
      return [count.id, { incoming: count.incoming, outgoing: count.outgoing }];
    }),
  );
}

export interface PersistedWorkspaceReads {
  readProvenance(): Promise<unknown>;
  readNoteProvenance(noteIds: readonly string[]): Promise<unknown>;
  readDependencies(cardIds?: readonly string[]): Promise<CardGraph>;
}

/** One bounded SQL statement sees a stable committed snapshot and never silently truncates history. */
export class WorkspaceDatabase implements PersistedWorkspaceReads {
  private discovered: string | null = null;
  private discoveredUntil = 0;
  private discovery: Promise<string> | null = null;

  constructor(
    private readonly workspace: string,
    private readonly discover: DiscoverDatabase = discoverDatabase,
    private readonly open: OpenDatabase = openDatabase,
  ) {}

  async readDependencies(cardIds: readonly string[] = []): Promise<CardGraph> {
    const snapshot = await this.readSnapshot(
      'dependencies',
      dependencySql(cardIds),
      [...cardIds, ...cardIds],
      decodeProvenance,
    );
    const endpointIds = [
      ...new Set(snapshot.edges.flatMap((edge) => [edge.from_strand_id, edge.to_strand_id])),
    ];
    // A scoped read still needs workspace-wide counts for its neighbours; the full read has them all.
    const counts =
      cardIds.length === 0
        ? countDependencies(
            snapshot.edges.map((edge) => ({ from: edge.from_strand_id, to: edge.to_strand_id })),
          )
        : await this.readSnapshot(
            'dependency-counts',
            dependencyCountsSql,
            [JSON.stringify(endpointIds)],
            decodeDependencyCounts,
          );
    return parseGraph(
      {
        'root-id': '',
        strands: snapshot.strands,
        'parent-of-edges': [],
        'depends-on-edges': snapshot.edges,
      },
      { owner: () => null, dependencies: (id) => counts.get(id) ?? { incoming: 0, outgoing: 0 } },
    );
  }

  readProvenance(): Promise<unknown> {
    return this.readSnapshot(
      'provenance',
      provenanceSql,
      [...provenanceAttributeKeys, ...provenanceEdgeKinds],
      decodeProvenance,
    );
  }

  readNoteProvenance(noteIds: readonly string[]): Promise<unknown> {
    return this.readSnapshot(
      'note-provenance',
      noteProvenanceSql,
      [JSON.stringify(noteIds)],
      decodeProvenance,
    );
  }

  /** One `mill weaver list` per workspace window; a failed read rediscovers on the next attempt. */
  private databasePath(): Promise<string> {
    if (this.discovered !== null && Date.now() < this.discoveredUntil)
      return Promise.resolve(this.discovered);
    if (this.discovery !== null) return this.discovery;
    this.discovery = this.discover(this.workspace)
      .then((path) => {
        this.discovered = path;
        this.discoveredUntil = Date.now() + discoveryLifetime;
        return path;
      })
      .finally(() => {
        this.discovery = null;
      });
    return this.discovery;
  }

  private async readSnapshot<T>(
    label: string,
    sql: string,
    parameters: readonly string[],
    decode: (value: unknown) => T,
  ): Promise<T> {
    const started = performance.now();
    let database: ReadonlyDatabase | null = null;
    let rows = 0;
    let discovered = started;
    let queried = started;
    let decoded = started;
    let outcome = 'ok';
    try {
      database = this.open(await this.databasePath());
      discovered = performance.now();
      database.configure();
      schemaVersionSchema.parse(database.schemaVersion());
      const result = database.all(sql, parameters);
      rows = result.length;
      queried = performance.now();
      const snapshot = decode(result);
      decoded = performance.now();
      return snapshot;
    } catch (error) {
      outcome = 'failed';
      this.discovered = null;
      const message = error instanceof Error ? error.message : 'Unknown persisted read failure';
      throw new HttpError(502, `Provenance inspection failed: ${message.slice(0, 1500)}`);
    } finally {
      database?.close();
      recordPerf({
        scope: 'sqlite',
        target: label,
        workspace: basename(dirname(this.workspace)),
        ms: performance.now() - started,
        detail: `rows=${rows} discover=${(discovered - started).toFixed(2)}ms query=${(queried - discovered).toFixed(2)}ms decode=${(decoded - queried).toFixed(2)}ms outcome=${outcome}`,
      });
    }
  }
}
