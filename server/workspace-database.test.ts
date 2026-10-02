import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { ProvenanceIndex } from './provenance.ts';
import { MemoryPerfLogger } from '../shared/perf.ts';
import { WorkspaceDatabase } from './workspace-database.ts';
import { parseDatabasePath } from './workspace-storage.ts';

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
  const reader = new WorkspaceDatabase(workspace, {
    discover: async () => '/state/workspace.sqlite',
    open,
  });

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
  expect(parameters).toContain('harness/published');
  expect(parameters).toContain('performed');
  expect(parameters).toContain('serves-root');
  expect(parameters).not.toContain('depends-on');
  expect(sql).toContain("strand_edges.edge_type = 'depends-on'");
  expect(sql).toContain(`'$."millstrand-ui/dependency-incoming"'`);
  expect(sql).toContain(`'$."millstrand-ui/dependency-outgoing"'`);
  expect(parameters).not.toContain('note/text');
  expect(parameters).not.toContain('note/at');
  expect(parameters).not.toContain('note/kind');
  expect(parameters).toContain('identity/by-identity');
  expect(parameters).not.toContain('harness/env');
  expect(parameters).not.toContain('harness/prompt');
  expect(parameters).not.toContain('harness/model');
  expect(parameters).not.toContain('harness/effort');
  expect(parameters).toContain('harness/observed-model');
  expect(parameters).toContain('harness/observed-effort');
  expect(parameters).toContain('harness/ownership');
});

it('scopes log provenance to identities, published runs and performed edges', async () => {
  const database = fakeDatabase([]);
  const reader = new WorkspaceDatabase(workspace, {
    discover: async () => '/state/workspace.sqlite',
    open: () => database,
  });

  await expect(reader.readLogProvenance()).resolves.toEqual({ strands: [], edges: [] });
  const [sql, parameters] = database.all.mock.calls[0]!;
  expect(sql).toContain("strand_edges.edge_type = 'performed'");
  expect(sql).toContain('target.is_published');
  expect(sql).not.toContain("strand_edges.edge_type = 'depends-on'");
  expect(parameters).toContain('identity/native-session-id');
  expect(parameters).toContain('harness/session-id');
  expect(parameters).toContain('harness/status');
  expect(parameters).not.toContain('kanban/card');
  expect(parameters).not.toContain('identity/by-identity');
});

it('captures successful SQL measurements with only in-memory dependencies', async () => {
  const logger = new MemoryPerfLogger();
  const reader = new WorkspaceDatabase(workspace, {
    logger,
    discover: async () => '/state/workspace.sqlite',
    open: () => fakeDatabase(),
  });
  await reader.readProvenance();
  expect(logger.samples).toEqual([
    {
      scope: 'sqlite',
      target: 'provenance',
      workspace: '"unsafe"',
      ms: expect.any(Number),
      detail: expect.stringMatching(/^rows=1 .* outcome=ok$/),
    },
  ]);
});

it('reads note attribution provenance only for requested note IDs', async () => {
  const database = fakeDatabase([]);
  const reader = new WorkspaceDatabase(workspace, {
    discover: async () => '/state/workspace.sqlite',
    open: () => database,
  });

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
  const reader = new WorkspaceDatabase(workspace, {
    discover: async () => '/state/workspace.sqlite',
    open: () => database,
  });

  await expect(reader.readProvenance()).resolves.toMatchObject({
    strands: { length: 10_001 },
    edges: [],
  });
});

it('fails loudly on an unsupported persisted schema and still closes the database', async () => {
  const database = fakeDatabase([], 2);
  const reader = new WorkspaceDatabase(workspace, {
    discover: async () => '/state/workspace.sqlite',
    open: () => database,
  });

  await expect(reader.readProvenance()).rejects.toMatchObject({ status: 502 });
  expect(database.all).not.toHaveBeenCalled();
  expect(database.close).toHaveBeenCalledOnce();
});

it('fails malformed persisted records instead of returning a partial snapshot', async () => {
  const database = fakeDatabase([{ record: 'not-json' }]);
  const reader = new WorkspaceDatabase(workspace, {
    discover: async () => '/state/workspace.sqlite',
    open: () => database,
  });

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
  const reader = new WorkspaceDatabase(workspace, {
    discover: async () => '/state/workspace.sqlite',
    open: () => database,
  });

  await expect(reader.readProvenance()).rejects.toThrow('50000 role edges');
});

it('projects native lifecycle transitions from a persisted SQLite fixture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'millstrand-ui-native-'));
  const path = join(directory, 'workspace.sqlite');
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA user_version = 1;
    CREATE TABLE strands (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE attributes (
      strand_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      archived INTEGER NOT NULL,
      PRIMARY KEY (strand_id, key)
    );
    CREATE INDEX idx_attributes_key_value_hot
      ON attributes(key, value) WHERE archived = 0;
    CREATE INDEX idx_attributes_strand_hot
      ON attributes(strand_id) WHERE archived = 0;
    CREATE TABLE strand_edges (
      from_strand_id TEXT NOT NULL,
      to_strand_id TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      PRIMARY KEY (from_strand_id, to_strand_id, edge_type)
    );
    CREATE INDEX idx_strand_edges_to ON strand_edges(to_strand_id, edge_type);
  `);
  const insertStrand = database.prepare(
    'INSERT INTO strands (id, title, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  const insertAttribute = database.prepare(
    'INSERT INTO attributes (strand_id, key, value, archived) VALUES (?, ?, ?, 0)',
  );
  const insertEdge = database.prepare(
    'INSERT INTO strand_edges (from_strand_id, to_strand_id, edge_type) VALUES (?, ?, ?)',
  );
  const addStrand = (
    id: string,
    attributes: Record<string, string>,
    state = 'active',
    createdAt = '2026-09-24 10:00:00',
  ) => {
    insertStrand.run(id, id, state, createdAt, createdAt);
    for (const [key, value] of Object.entries(attributes))
      insertAttribute.run(id, key, JSON.stringify(value));
  };
  try {
    addStrand('card', { 'kanban/card': 'true' });
    addStrand('task', { 'kanban/task': 'true' });
    addStrand('dependency', {});
    addStrand('pre-binding-run', {
      'harness/run': 'true',
      'harness/published': 'true',
      'harness/alias': 'sol',
      'harness/harness': 'pi',
      'harness/status': 'running',
      'harness/mode': 'headless',
      'harness/session-id': 'session-1',
    });
    addStrand('unpublished-run', {
      'harness/run': 'true',
      'harness/harness': 'pi',
      'harness/status': 'running',
      'harness/mode': 'headless',
    });
    addStrand('unrelated', {});
    insertEdge.run('card', 'task', 'parent-of');
    insertEdge.run('card', 'unrelated', 'parent-of');
    insertEdge.run('card', 'dependency', 'depends-on');
    insertEdge.run('dependency', 'task', 'depends-on');
    insertEdge.run('pre-binding-run', 'task', 'serves');

    const reader = new WorkspaceDatabase(workspace, { discover: async () => path });
    const beforeSnapshot = await reader.readProvenance();
    expect(beforeSnapshot).toMatchObject({
      strands: expect.not.arrayContaining([expect.objectContaining({ id: 'unpublished-run' })]),
      edges: expect.not.arrayContaining([
        expect.objectContaining({ from_strand_id: 'card', to_strand_id: 'unrelated' }),
      ]),
    });
    const before = new ProvenanceIndex(beforeSnapshot);
    expect(before.agents()).toMatchObject({
      identities: [],
      runs: [{ id: 'pre-binding-run', target: 'task', participants: [] }],
    });

    addStrand('parent-identity', {
      'identity/session': 'true',
      'identity/id': 'native-parent',
      'identity/harness': 'pi',
      'identity/native-session-id': 'session-1',
      'identity/model': 'pi/actual',
      'identity/thinking-level': 'high',
    });
    insertAttribute.run('pre-binding-run', 'harness/observed-model', JSON.stringify('pi/actual'));
    insertAttribute.run('pre-binding-run', 'harness/observed-effort', JSON.stringify('high'));
    insertEdge.run('parent-identity', 'pre-binding-run', 'performed');
    addStrand(
      'claim',
      {
        'kanban/ownership-claim': 'true',
        'kanban/owner': 'native-parent',
        'kanban/claimed-at': '2026-09-24T10:01:00Z',
      },
      'closed',
    );
    insertEdge.run('claim', 'card', 'claims');
    insertEdge.run('parent-identity', 'claim', 'claimed');

    addStrand(
      'resumed-run',
      {
        'harness/run': 'true',
        'harness/published': 'true',
        'harness/alias': 'sol',
        'harness/harness': 'pi',
        'harness/status': 'stopped',
        'harness/substatus': 'completed',
        'harness/mode': 'headless',
        'harness/session-id': 'session-1',
        'harness/observed-model': 'pi/actual',
        'harness/observed-effort': 'high',
      },
      'closed',
      '2026-09-24 10:02:00',
    );
    insertEdge.run('parent-identity', 'resumed-run', 'performed');
    insertEdge.run('resumed-run', 'pre-binding-run', 'resumes');

    addStrand('child-identity', {
      'identity/session': 'true',
      'identity/id': 'native-child',
      'identity/harness': 'pi',
      'identity/native-session-id': 'session-child',
      'identity/model': 'pi/actual',
      'identity/thinking-level': 'unknown',
    });
    insertEdge.run('parent-identity', 'child-identity', 'parent-of');
    addStrand('direct-run', {
      'harness/run': 'true',
      'harness/published': 'true',
      'harness/harness': 'pi',
      'harness/status': 'running',
      'harness/mode': 'external',
      'harness/ownership': 'external',
      'harness/session-id': 'session-child',
      'harness/observed-model': 'pi/actual',
      'harness/observed-effort': 'unknown',
    });
    insertEdge.run('child-identity', 'direct-run', 'performed');

    const afterSnapshot = await reader.readProvenance();
    expect(afterSnapshot).toMatchObject({
      edges: expect.not.arrayContaining([expect.objectContaining({ edge_type: 'depends-on' })]),
    });
    const after = new ProvenanceIndex(afterSnapshot);
    expect(after.dependencies('card')).toEqual({ incoming: 0, outgoing: 1 });
    expect(after.dependencies('task')).toEqual({ incoming: 1, outgoing: 0 });
    const projection = after.agents();
    expect(projection.runs.find(({ id }) => id === 'pre-binding-run')).toMatchObject({
      target: 'task',
      participants: [{ identityStrandIds: ['parent-identity'] }],
      model: 'pi/actual',
      effort: 'high',
    });
    expect(projection.runs.find(({ id }) => id === 'resumed-run')).toMatchObject({
      status: 'stopped',
      substatus: 'completed',
      continuation: { kind: 'native-resume', predecessorRunId: 'pre-binding-run' },
    });
    expect(projection.runs.find(({ id }) => id === 'direct-run')).toMatchObject({
      alias: null,
      ownership: 'external',
      effort: 'unknown',
      target: null,
    });
    expect(
      projection.identities.find(({ strandId }) => strandId === 'child-identity'),
    ).toMatchObject({ parentIdentityStrandIds: ['parent-identity'] });
    expect(after.ownership('card').current).toMatchObject({
      owner: { identity: 'native-parent', identityStrandIds: ['parent-identity'] },
    });
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
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
  const reader = new WorkspaceDatabase(workspace, {
    discover: async () => '/state/workspace.sqlite',
    open: () => database,
  });
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

it('scopes dependency edges to expanded cards while keeping workspace-wide counts', async () => {
  const calls: { sql: string; parameters: readonly string[] }[] = [];
  const database = {
    configure: vi.fn(),
    schemaVersion: vi.fn(() => ({ user_version: 1 })),
    all: vi.fn((sql: string, parameters: readonly string[]) => {
      calls.push({ sql, parameters });
      if (sql.includes('json_each(?)'))
        return [{ record: JSON.stringify({ id: 'strand1', incoming: 3, outgoing: 1 }) }];
      return [
        strandRecord,
        { record: JSON.stringify({ ...persistedStrand, id: 'strand2', title: 'Other' }) },
        {
          record: JSON.stringify({
            kind: 'edge',
            from_strand_id: 'strand1',
            to_strand_id: 'strand2',
            edge_type: 'depends-on',
          }),
        },
      ];
    }),
    close: vi.fn(),
  };
  const reader = new WorkspaceDatabase(workspace, {
    discover: async () => '/state/workspace.sqlite',
    open: () => database,
  });
  const graph = await reader.readDependencies(['strand1']);
  expect(graph.edges).toEqual([{ kind: 'depends-on', from: 'strand1', to: 'strand2' }]);
  expect(graph.nodes.find((node) => node.id === 'strand1')?.dependencies).toEqual({
    incoming: 3,
    outgoing: 1,
  });
  expect(calls[0]?.sql).toContain('from_strand_id IN (?)');
  expect(calls[0]?.parameters).toEqual(['strand1', 'strand1']);
  expect(calls[1]?.sql).toContain('json_each(?)');
  expect(calls[1]?.parameters).toEqual([JSON.stringify(['strand1', 'strand2'])]);
});
