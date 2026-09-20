import { execFile } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { HttpError } from './parse.ts';

const exec = promisify(execFile);
const strandLimit = 10_000;
const edgeLimit = 50_000;
const supportedSchemaVersion = 1;

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
  'harness/model',
  'harness/effort',
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
  'note/text',
  'note/at',
  'note/kind',
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
        OR marker.key = 'note/text'
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
    LIMIT ${strandLimit + 1}
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
        strand_edges.from_strand_id IN (SELECT strand_id FROM candidate_ids)
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
          AND EXISTS (
            SELECT 1 FROM attributes AS child_task
            WHERE child_task.strand_id = strand_edges.to_strand_id
              AND child_task.archived = 0
              AND child_task.key = 'kanban/task'
              AND child_task.value = '"true"'
          )
        )
      )
    ORDER BY strand_edges.edge_type,
             strand_edges.from_strand_id,
             strand_edges.to_strand_id
    LIMIT ${edgeLimit + 1}
  )
  SELECT record FROM projected_strands
  UNION ALL
  SELECT record FROM projected_edges
`;

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
  const { stdout } = await exec('mill', ['weaver', 'list'], {
    cwd: dirname(workspace),
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
    encoding: 'utf8',
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

function decodeProvenance(value: unknown): unknown {
  const records = databaseRowsSchema
    .parse(value)
    .map(({ record }) => persistedRecordSchema.parse(JSON.parse(record) as unknown));
  const strands = records.filter((record) => record.kind === 'strand');
  const edges = records.filter((record) => record.kind === 'edge');
  if (strands.length > strandLimit)
    throw new Error(`Provenance inspection matched more than ${strandLimit} strands.`);
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

export interface PersistedWorkspaceReads {
  readProvenance(): Promise<unknown>;
}

/** One bounded SQL statement sees a stable committed snapshot and never silently truncates history. */
export class WorkspaceDatabase implements PersistedWorkspaceReads {
  constructor(
    private readonly workspace: string,
    private readonly discover: DiscoverDatabase = discoverDatabase,
    private readonly open: OpenDatabase = openDatabase,
  ) {}

  async readProvenance(): Promise<unknown> {
    let database: ReadonlyDatabase | null = null;
    try {
      database = this.open(await this.discover(this.workspace));
      database.configure();
      schemaVersionSchema.parse(database.schemaVersion());
      return decodeProvenance(
        database.all(provenanceSql, [...provenanceAttributeKeys, ...provenanceEdgeKinds]),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown persisted read failure';
      throw new HttpError(502, `Provenance inspection failed: ${message.slice(0, 1500)}`);
    } finally {
      database?.close();
    }
  }
}
