import { describe, expect, it } from 'vitest';
import { parseWorkspaces, WorkspaceDirectory, workspaceId } from './workspaces.ts';

describe('weaver discovery', () => {
  const defaultPath = '/work/main/.millstrand';

  it('identifies independent workspaces by their canonical config path, not generation IDs', () => {
    const result = parseWorkspaces(
      [
        { config_dir: defaultPath, state: 'running', weaver_id: 'generation-one' },
        { config_dir: '/work/other/.millstrand', state: 'stopped', weaver_id: 'generation-two' },
      ],
      defaultPath,
    );
    expect(result).toEqual([
      { id: workspaceId(defaultPath), name: 'main', path: defaultPath, status: 'running' },
      {
        id: workspaceId('/work/other/.millstrand'),
        name: 'other',
        path: '/work/other/.millstrand',
        status: 'offline',
      },
    ]);
    expect(
      parseWorkspaces(
        [{ config_dir: defaultPath, state: 'running', weaver_id: 'restarted' }],
        defaultPath,
      )[0]?.id,
    ).toBe(result[0]?.id);
  });

  it('keeps an explicitly configured workspace visible when its weaver is no longer registered', () => {
    expect(parseWorkspaces([], defaultPath)).toEqual([
      { id: workspaceId(defaultPath), name: 'main', path: defaultPath, status: 'offline' },
    ]);
  });

  it('rejects malformed registry paths instead of resolving them against the dashboard cwd', () => {
    expect(() =>
      parseWorkspaces([{ config_dir: '../other', state: 'running' }], defaultPath),
    ).toThrow('absolute path');
  });

  it('bypasses its recent discovery snapshot when refresh is forced', async () => {
    let discoveries = 0;
    const directory = new WorkspaceDirectory(defaultPath, async () => {
      discoveries += 1;
      return parseWorkspaces(
        [
          {
            config_dir: defaultPath,
            state: discoveries === 1 ? 'running' : 'stopped',
          },
        ],
        defaultPath,
      );
    });

    expect((await directory.list())[0]?.status).toBe('running');
    expect((await directory.list())[0]?.status).toBe('running');
    expect(discoveries).toBe(1);
    expect((await directory.list(true))[0]?.status).toBe('offline');
    expect(discoveries).toBe(2);
  });
  it('resolves lifecycle operations from known IDs, including offline workspaces', async () => {
    const calls: string[][] = [];
    const directory = new WorkspaceDirectory(
      defaultPath,
      async () => parseWorkspaces([], defaultPath),
      async (operation, path) => {
        calls.push([operation, path]);
      },
    );
    await expect(directory.operate('/unregistered/.millstrand', 'start')).rejects.toMatchObject({
      status: 404,
    });
    expect(calls).toEqual([]);
    await directory.operate(workspaceId(defaultPath), 'start');
    expect(calls).toEqual([['start', defaultPath]]);
  });

  it('reports command failures without retrying and expires discovery afterwards', async () => {
    let discoveries = 0;
    let commands = 0;
    const directory = new WorkspaceDirectory(
      defaultPath,
      async () => {
        discoveries += 1;
        return parseWorkspaces([], defaultPath);
      },
      async () => {
        commands += 1;
        throw new Error('mill unavailable');
      },
    );
    await expect(directory.operate(workspaceId(defaultPath), 'restart')).rejects.toThrow(
      'Refresh status before trying again: mill unavailable',
    );
    expect(commands).toBe(1);
    await directory.list();
    expect(discoveries).toBe(2);
  });
});
