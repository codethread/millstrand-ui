import { expect, it, vi } from 'vitest';
import { parseDatabasePath, WorkspaceDatabase } from './workspace-database.ts';

const workspace = '/repo/"unsafe"/.millstrand';
const row = {
  id: 'strand1',
  title: 'Strand',
  state: 'active',
  created_at: '2026-09-18 00:00:00',
  updated_at: '2026-09-18 00:00:00',
  attributes: '{"owner":"agent"}',
};

function fakeDatabase(rows: unknown[] = [row], version = 1) {
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
  expect(() =>
    parseDatabasePath(
      [
        {
          config_dir: workspace,
          database_kind: 'sqlite-file',
          database_label: 'relative.sqlite',
          database_path: 'relative.sqlite',
        },
      ],
      workspace,
    ),
  ).toThrow('storage metadata is inconsistent');
});

it('runs bounded selective agent SQL without interpolating the workspace', async () => {
  const database = fakeDatabase();
  const open = vi.fn(() => database);
  const reader = new WorkspaceDatabase(workspace, async () => '/state/workspace.sqlite', open);

  await expect(reader.readAgentStrands()).resolves.toEqual([
    { ...row, attributes: { owner: 'agent' } },
  ]);
  expect(open).toHaveBeenCalledWith('/state/workspace.sqlite');
  expect(database.configure).toHaveBeenCalledOnce();
  expect(database.close).toHaveBeenCalledOnce();
  const [sql, parameters] = database.all.mock.calls[0]!;
  expect(sql).toContain('LIMIT 10001');
  expect(sql).toContain("identity_session.key = 'identity/session'");
  expect(sql).toContain("published.key = 'harness/published'");
  expect(sql).toContain("owner.key = 'owner'");
  expect(sql).not.toContain(workspace);
  expect(parameters).toContain('identity/id');
  expect(parameters).not.toContain('harness/env');
});

it('projects only dashboard card attributes and label flags', async () => {
  const database = fakeDatabase();
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );

  await reader.readCardStrands();
  const [sql, parameters] = database.all.mock.calls[0]!;
  expect(sql).toContain("card.key = 'kanban/card'");
  expect(sql).toContain("attributes.key LIKE 'kanban.label/%'");
  expect(sql).toContain('LIMIT 10001');
  expect(sql).not.toContain(workspace);
  expect(parameters).toContain('auto-run/error');
  expect(parameters).not.toContain('body');
});

it('fails loudly on an unsupported persisted schema and still closes the database', async () => {
  const database = fakeDatabase([], 2);
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );

  await expect(reader.readAgentStrands()).rejects.toMatchObject({ status: 502 });
  expect(database.all).not.toHaveBeenCalled();
  expect(database.close).toHaveBeenCalledOnce();
});

it('fails malformed persisted rows instead of returning a partial snapshot', async () => {
  const database = fakeDatabase([{ ...row, attributes: 'not-json' }]);
  const reader = new WorkspaceDatabase(
    workspace,
    async () => '/state/workspace.sqlite',
    () => database,
  );

  await expect(reader.readCardStrands()).rejects.toMatchObject({ status: 502 });
  expect(database.close).toHaveBeenCalledOnce();
});
