import { execFile } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { HttpError } from './parse.ts';

const exec = promisify(execFile);
const resultLimit = 10_000;
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
const strandRowsSchema = z.compile(
  z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      state: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      attributes: z.string(),
    }),
  ),
  { strict: true },
);
const schemaVersionSchema = z.object({ user_version: z.literal(supportedSchemaVersion) });

const agentAttributeKeys = [
  'identity/session',
  'identity/id',
  'identity/harness',
  'identity/native-session-id',
  'identity/model',
  'identity/thinking-level',
  'harness/run',
  'harness/published',
  'harness/request-id',
  'harness/alias',
  'harness/harness',
  'harness/status',
  'harness/substatus',
  'harness/mode',
  'harness/model',
  'harness/effort',
  'harness/cwd',
  'harness/target',
  'harness/root-targets',
  'harness/started-at',
  'harness/finished-at',
  'owner',
  'kanban/card',
  'kanban/task',
] as const;
const cardAttributeKeys = [
  'kanban/type',
  'kanban/lane',
  'kanban/priority',
  'kanban/source',
  'kanban/outcome',
  'owner',
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

function placeholders(values: readonly string[]): string {
  return values.map(() => '?').join(', ');
}

const agentInspectionSql = `
  WITH candidate_ids(strand_id) AS (
    SELECT identity_session.strand_id
    FROM attributes AS identity_session
    WHERE identity_session.archived = 0
      AND identity_session.key = 'identity/session'
      AND identity_session.value = '"true"'

    UNION

    SELECT harness_run.strand_id
    FROM attributes AS harness_run
    JOIN attributes AS published
      ON published.strand_id = harness_run.strand_id
     AND published.archived = 0
     AND published.key = 'harness/published'
     AND published.value = '"true"'
    JOIN attributes AS identity_id
      ON identity_id.strand_id = harness_run.strand_id
     AND identity_id.archived = 0
     AND identity_id.key = 'identity/id'
    WHERE harness_run.archived = 0
      AND harness_run.key = 'harness/run'
      AND harness_run.value = '"true"'

    UNION

    SELECT owner.strand_id
    FROM attributes AS owner
    WHERE owner.archived = 0
      AND owner.key = 'owner'

    ORDER BY strand_id
    LIMIT ${resultLimit + 1}
  ),
  candidates AS (
    SELECT strands.id,
           strands.title,
           strands.state,
           strands.created_at,
           strands.updated_at
    FROM candidate_ids
    JOIN strands ON strands.id = candidate_ids.strand_id
  )
  SELECT candidates.id,
         candidates.title,
         candidates.state,
         candidates.created_at,
         candidates.updated_at,
         json_group_object(attributes.key, json(attributes.value)) AS attributes
  FROM candidates
  JOIN attributes
    ON attributes.strand_id = candidates.id
   AND attributes.archived = 0
   AND attributes.key IN (${placeholders(agentAttributeKeys)})
  GROUP BY candidates.id,
           candidates.title,
           candidates.state,
           candidates.created_at,
           candidates.updated_at
  ORDER BY candidates.id
`;

const cardInspectionSql = `
  WITH candidates AS (
    SELECT s.id, s.title, s.state, s.created_at, s.updated_at
    FROM strands AS s
    JOIN attributes AS card
      ON card.strand_id = s.id
     AND card.archived = 0
     AND card.key = 'kanban/card'
     AND card.value = '"true"'
    ORDER BY s.id
    LIMIT ${resultLimit + 1}
  )
  SELECT candidates.id,
         candidates.title,
         candidates.state,
         candidates.created_at,
         candidates.updated_at,
         COALESCE(
           (
             SELECT json_group_object(attributes.key, json(attributes.value))
             FROM attributes
             WHERE attributes.strand_id = candidates.id
               AND attributes.archived = 0
               AND (
                 attributes.key IN (${placeholders(cardAttributeKeys)})
                 OR attributes.key LIKE 'kanban.label/%'
               )
           ),
           '{}'
         ) AS attributes
  FROM candidates
  ORDER BY candidates.id
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

function decodeRows(value: unknown): unknown[] {
  const parsed = strandRowsSchema.parse(value);
  if (parsed.length > resultLimit)
    throw new Error(`Inspection matched more than ${resultLimit} strands.`);
  return parsed.map((row) => ({
    ...row,
    attributes: JSON.parse(row.attributes) as unknown,
  }));
}

export interface PersistedWorkspaceReads {
  readAgentStrands(): Promise<unknown[]>;
  readCardStrands(): Promise<unknown[]>;
}

/** Short autocommit reads see committed WAL data without keeping a read transaction open. */
export class WorkspaceDatabase implements PersistedWorkspaceReads {
  constructor(
    private readonly workspace: string,
    private readonly discover: DiscoverDatabase = discoverDatabase,
    private readonly open: OpenDatabase = openDatabase,
  ) {}

  private async inspect(
    label: 'Agent' | 'Card',
    sql: string,
    parameters: readonly string[],
  ): Promise<unknown[]> {
    let database: ReadonlyDatabase | null = null;
    try {
      database = this.open(await this.discover(this.workspace));
      database.configure();
      schemaVersionSchema.parse(database.schemaVersion());
      return decodeRows(database.all(sql, parameters));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown persisted read failure';
      throw new HttpError(502, `${label} inspection failed: ${message.slice(0, 1500)}`);
    } finally {
      database?.close();
    }
  }

  readAgentStrands(): Promise<unknown[]> {
    return this.inspect('Agent', agentInspectionSql, agentAttributeKeys);
  }

  readCardStrands(): Promise<unknown[]> {
    return this.inspect('Card', cardInspectionSql, cardAttributeKeys);
  }
}
