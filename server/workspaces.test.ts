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
});
