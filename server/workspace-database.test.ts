import { expect, it, vi } from 'vitest';
import { parseDatabasePath, WorkspaceDatabase } from './workspace-database.ts';

const workspace = '/repo/"unsafe"/.millstrand';
const persistedStrand = {
  kind: 'strand',
  id: 'strand1',
  title: 'Strand',
  state: 'active',
  created_at: '2026-09-18 00:00:00',
  updated_at: '2026-09-18 00:00:00',
  attributes: { 'kanban/card': 'true' },
};
const strandRecord = { record: JSON.stringify(persistedStrand) };

function fakeDatabase(rows: unknown[] = [strandRecord], version = 1) {
  return {
    configure: vi.fn(),
    schemaVersion: vi.fn(() => ({ user_version: version })),
    all: vi.fn((_sql: string, _parameters: readonly string[]) => rows),
    close: vi.fn(),
  };
}

it('selects the registered file-backed SQLite database for the exact workspace', () => {
  expect(
    parseDatabasePath(
      [
        {
          config_dir: '/repo/other/.millstrand',
          database_kind: 'sqlite-file',
          database_label: '/state/other.sqlite',
          database_path: '/state/other.sqlite',
        },
        {
          config_dir: workspace,
          database_kind: 'sqlite-file',
          database_label: '/state/workspace.sqlite',
          database_path: '/state/workspace.sqlite',
        },
      ],
      workspace,
    ),
  ).toBe('/state/workspace.sqlite');
  expect(() =>
    parseDatabasePath(
      [
        {
          config_dir: workspace,
          database_kind: 'sqlite-memory',
          database_label: 'memory',
          database_path: null,
        },
      ],
      workspace,
    ),
  ).toThrow('not file-backed SQLite');
});

it('runs one selective graph read without note strands or workspace interpolation', async () => {
  const database = fakeDatabase();
  const open = vi.fn(() => database);
  const reader = new WorkspaceDatabase(workspace, async () => '/state/workspace.sqlite', open);

  await expect(reader.readProvenance()).resolves.toEqual({
    strands: [
      {
        id: 'strand1',
        title: 'Strand',
        state: 'active',
        created_at: '2026-09-18 00:00:00',
        updated_at: '2026-09-18 00:00:00',
        attributes: { 'kanban/card': 'true' },
      },
    ],
    edges: [],
  });
  expect(open).toHaveBeenCalledWith('/state/workspace.sqlite');
  expect(database.configure).toHaveBeenCalledOnce();
  expect(database.close).toHaveBeenCalledOnce();
  const [sql, parameters] = database.all.mock.calls[0]!;
  expect(sql).not.toContain('LIMIT 10001');
  expect(sql).toContain('LIMIT 50001');
  expect(sql).toContain("marker.key = 'harness/run'");
  expect(sql).not.toContain("marker.key = 'note/text'");
  expect(sql).toContain("attributes.key LIKE 'kanban.label/%'");
  expect(sql).not.toContain(workspace);
  expect(parameters).toContain('kanban/ownership-claim');
  expect(parameters).toContain('performed');
  expect(parameters).toContain('serves-root');
  expect(parameters).toContain('depends-on');
  expect(sql).toContain("strand_edges.edge_type = 'depends-on'");
  expect(parameters).not.toContain('note/text');
  expect(parameters).not.toContain('note/at');
  expect(parameters).not.toContain('note/kind');
  expect(parameters).toContain('identity/by-identity');
  expect(parameters).not.toContain('harness/env');
  expect(parameters).not.toContain('harness/prompt');
});

it('reads note attribution provenance only for requested note IDs', async () => {
  const database = fakeDatabase([]);
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );

  await expect(reader.readNoteProvenance(['note1', 'note2'])).resolves.toEqual({
    strands: [],
    edges: [],
  });
  const [sql, parameters] = database.all.mock.calls[0]!;
  expect(parameters).toEqual(['["note1","note2"]']);
  expect(sql).toContain('SELECT value FROM json_each(?)');
  expect(sql).toContain("actor.key = 'identity/by-identity'");
  expect(sql).toContain("strand_edges.edge_type = 'attributed'");
  expect(sql).not.toContain("marker.key = 'note/text'");
});

it('does not reject a valid provenance snapshot based on its strand count', async () => {
  const database = fakeDatabase(
    Array.from({ length: 10_001 }, (_, index) => ({
      record: JSON.stringify({ ...persistedStrand, id: `strand${index}` }),
    })),
  );
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );

  await expect(reader.readProvenance()).resolves.toMatchObject({
    strands: { length: 10_001 },
    edges: [],
  });
});

it('fails loudly on an unsupported persisted schema and still closes the database', async () => {
  const database = fakeDatabase([], 2);
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );

  await expect(reader.readProvenance()).rejects.toMatchObject({ status: 502 });
  expect(database.all).not.toHaveBeenCalled();
  expect(database.close).toHaveBeenCalledOnce();
});

it('fails malformed persisted records instead of returning a partial snapshot', async () => {
  const database = fakeDatabase([{ record: 'not-json' }]);
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );

  await expect(reader.readProvenance()).rejects.toMatchObject({ status: 502 });
  expect(database.close).toHaveBeenCalledOnce();
});

it('rejects an edge overflow rather than silently truncating history', async () => {
  const edge = {
    kind: 'edge',
    from_strand_id: 'identity',
    to_strand_id: 'run',
    edge_type: 'performed',
  };
  const database = fakeDatabase(
    Array.from({ length: 50_001 }, () => ({ record: JSON.stringify(edge) })),
  );
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );

  await expect(reader.readProvenance()).rejects.toThrow('50000 role edges');
});

it('reads dependency endpoints with display-only metadata and directed links', async () => {
  const database = fakeDatabase([
    strandRecord,
    {
      record: JSON.stringify({
        kind: 'edge',
        from_strand_id: 'strand1',
        to_strand_id: 'outside',
        edge_type: 'depends-on',
      }),
    },
  ]);
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );
  const graph = await reader.readDependencies();
  expect(graph.nodes[0]).toMatchObject({
    id: 'strand1',
    kind: 'feature',
    owner: null,
    dependencies: { incoming: 0, outgoing: 1 },
  });
  expect(graph.edges).toEqual([{ kind: 'depends-on', from: 'strand1', to: 'outside' }]);
  expect(database.close).toHaveBeenCalledOnce();
  const [sql] = database.all.mock.calls[0]!;
  expect(sql).not.toContain('LIMIT 10001');
  expect(sql).toContain('LIMIT 50001');
  expect(sql).toContain("edge_type = 'depends-on'");
  expect(sql).not.toContain('harness/prompt');
});
