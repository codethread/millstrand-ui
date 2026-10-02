import { countDependencies } from '../shared/dependencies.ts';
import { DatabaseSync } from 'node:sqlite';
import { basename, dirname } from 'node:path';
import { z } from 'zod';
import { HttpError, parseGraph } from './parse.ts';
import { dependencyCountAttributes } from './provenance.ts';
import { nullPerfLogger, type PerfLogger } from '../shared/perf.ts';
import type { CardGraph, DependencyCounts } from '../shared/api.ts';
import { discoverDatabase } from './workspace-storage.ts';
import { logProvenanceAttributeKeys, logProvenanceSql } from './log-provenance-sql.ts';

const edgeLimit = 50_000;
const supportedSchemaVersion = 1;
// The weaver's file-backed database moves only across restarts or reconfiguration.
const discoveryLifetime = 30_000;
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
] as const;
const provenanceMarkerKeys = [
  'identity/session',
  'kanban/card',
  'kanban/task',
  'kanban/ownership-claim',
  'harness/run',
  'harness/published',
] as const;
function placeholders(values: readonly string[]): string {
  return values.map(() => '?').join(', ');
}

const provenanceSql = `
  WITH candidate_markers AS (
    SELECT marker.strand_id,
           MAX(marker.key = 'identity/session') AS is_identity,
           MAX(marker.key = 'kanban/card') AS is_card,
           MAX(marker.key = 'kanban/task') AS is_task,
           MAX(marker.key = 'kanban/ownership-claim') AS is_ownership_claim,
           MAX(marker.key = 'harness/run') AS is_run,
           MAX(marker.key = 'harness/published') AS is_published
    FROM attributes AS marker
    WHERE marker.archived = 0
      AND marker.key IN (${placeholders(provenanceMarkerKeys)})
      AND marker.value = '"true"'
    GROUP BY marker.strand_id
    HAVING is_identity
      OR is_card
      OR is_task
      OR is_ownership_claim
      OR (is_run AND is_published)
  ),
  candidate_strands AS (
    SELECT candidate_markers.*,
           strands.id,
           strands.title,
           strands.state,
           strands.created_at,
           strands.updated_at,
           COALESCE(
             (
               SELECT json_group_object(attributes.key, json(attributes.value))
               FROM attributes
               WHERE attributes.strand_id = strands.id
                 AND attributes.archived = 0
                 AND (
                   attributes.key IN (${placeholders(provenanceAttributeKeys)})
                   OR attributes.key LIKE 'kanban.label/%'
                 )
             ),
             '{}'
           ) AS projected_attributes
    FROM candidate_markers
    JOIN strands ON strands.id = candidate_markers.strand_id
  ),
  projected_strands AS (
    SELECT json_object(
             'kind', 'strand',
             'id', candidate_strands.id,
             'title', candidate_strands.title,
             'state', candidate_strands.state,
             'created_at', candidate_strands.created_at,
             'updated_at', candidate_strands.updated_at,
             'attributes', json(
               CASE WHEN candidate_strands.is_card OR candidate_strands.is_task
                 THEN json_set(
                   candidate_strands.projected_attributes,
                   '$."${dependencyCountAttributes.incoming}"',
                   (
                     SELECT count(*) FROM strand_edges
                     WHERE strand_edges.to_strand_id = candidate_strands.id
                       AND strand_edges.edge_type = 'depends-on'
                   ),
                   '$."${dependencyCountAttributes.outgoing}"',
                   (
                     SELECT count(*) FROM strand_edges
                     WHERE strand_edges.from_strand_id = candidate_strands.id
                       AND strand_edges.edge_type = 'depends-on'
                   )
                 )
                 ELSE candidate_strands.projected_attributes
               END
             )
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
    LEFT JOIN candidate_markers AS source
      ON source.strand_id = strand_edges.from_strand_id
    LEFT JOIN candidate_markers AS target
      ON target.strand_id = strand_edges.to_strand_id
    WHERE strand_edges.edge_type IN (${placeholders(provenanceEdgeKinds)})
      AND (source.strand_id IS NOT NULL OR target.strand_id IS NOT NULL)
      AND (
        strand_edges.edge_type <> 'parent-of'
        OR (source.is_card AND (target.is_task OR target.is_card))
        OR (source.is_identity AND target.is_identity)
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
  readLogProvenance(): Promise<unknown>;
  readNoteProvenance(noteIds: readonly string[]): Promise<unknown>;
  readDependencies(cardIds?: readonly string[]): Promise<CardGraph>;
}

interface WorkspaceDatabaseOptions {
  discover?: DiscoverDatabase;
  open?: OpenDatabase;
  logger?: PerfLogger;
}

/** One bounded SQL statement sees a stable committed snapshot and never silently truncates history. */
export class WorkspaceDatabase implements PersistedWorkspaceReads {
  private readonly discover: DiscoverDatabase;
  private readonly open: OpenDatabase;
  private readonly logger: PerfLogger;
  private discovered: string | null = null;
  private discoveredUntil = 0;
  private discovery: Promise<string> | null = null;

  constructor(
    private readonly workspace: string,
    {
      logger = nullPerfLogger,
      discover = (path) => discoverDatabase(path, logger),
      open = openDatabase,
    }: WorkspaceDatabaseOptions = {},
  ) {
    this.discover = discover;
    this.open = open;
    this.logger = logger;
  }

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
      [...provenanceMarkerKeys, ...provenanceAttributeKeys, ...provenanceEdgeKinds],
      decodeProvenance,
    );
  }

  readLogProvenance(): Promise<unknown> {
    return this.readSnapshot(
      'log-provenance',
      logProvenanceSql(edgeLimit),
      logProvenanceAttributeKeys,
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
      this.logger.record({
        scope: 'sqlite',
        target: label,
        workspace: basename(dirname(this.workspace)),
        ms: performance.now() - started,
        detail: `rows=${rows} discover=${(discovered - started).toFixed(2)}ms query=${(queried - discovered).toFixed(2)}ms decode=${(decoded - queried).toFixed(2)}ms outcome=${outcome}`,
      });
    }
  }
}
