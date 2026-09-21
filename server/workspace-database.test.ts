import { expect, it, vi } from 'vitest';
import { parseDatabasePath, WorkspaceDatabase } from './workspace-database.ts';

const workspace = '/repo/"unsafe"/.millstrand';
const strandRecord = {
  record: JSON.stringify({
    kind: 'strand',
    id: 'strand1',
    title: 'Strand',
    state: 'active',
    created_at: '2026-09-18 00:00:00',
    updated_at: '2026-09-18 00:00:00',
    attributes: { 'kanban/card': 'true' },
  }),
};

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

it('runs one bounded selective graph read without interpolating the workspace', async () => {
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
  expect(sql).toContain('LIMIT 10001');
  expect(sql).toContain('LIMIT 50001');
  expect(sql).toContain("marker.key = 'harness/run'");
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
  expect(sql).toContain('LIMIT 10001');
  expect(sql).toContain('LIMIT 50001');
  expect(sql).toContain("edge_type = 'depends-on'");
  expect(sql).not.toContain('harness/prompt');
});

it('resolves launch refusals for exactly the requested strands in one bounded statement', async () => {
  const database = fakeDatabase([
    {
      target_id: 'blocked',
      target_state: 'active',
      target_lane: 'pending',
      blocker_id: 'dep1',
      blocker_lane: 'refinement',
    },
    {
      target_id: 'ready',
      target_state: 'active',
      target_lane: null,
      blocker_id: null,
      blocker_lane: null,
    },
    {
      target_id: 'gone',
      target_state: null,
      target_lane: null,
      blocker_id: null,
      blocker_lane: null,
    },
  ]);
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );

  const refusals = await reader.readLaunchRefusals(['blocked', 'ready', 'gone']);
  expect([...refusals]).toEqual([
    ['blocked', { kind: 'blocked', blockers: [{ id: 'dep1', lane: 'refinement' }] }],
    ['gone', { kind: 'missing' }],
  ]);
  const [sql, parameters] = database.all.mock.calls[0]!;
  // Three requested ids become three bound placeholders in one VALUES list.
  expect(parameters).toEqual(['blocked', 'ready', 'gone']);
  expect(sql.match(/\(\?\)/g)).toHaveLength(3);
  expect(sql).toContain("edge_type = 'depends-on'");
  expect(sql).toContain("blockers.state = 'active'");
  expect(sql).not.toContain('harness/prompt');
  expect(sql).not.toContain(workspace);
  expect(database.close).toHaveBeenCalledOnce();
});

it('never interpolates an unbounded readiness request', async () => {
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => fakeDatabase([]),
  );
  await expect(reader.readLaunchRefusals([])).resolves.toEqual(new Map());
  await expect(
    reader.readLaunchRefusals(Array.from({ length: 501 }, (_value, index) => `s${index}`)),
  ).rejects.toMatchObject({ status: 502 });
});
