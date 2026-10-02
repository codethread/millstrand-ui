import { describe, expect, it, vi } from 'vitest';
import { parseWorkspaces, WorkspaceDirectory, workspaceId } from './workspaces.ts';

function uninitializedSignal(): never {
  throw new Error('Promise signal was not initialized.');
}

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

  it('bypasses its discovery snapshot when refresh is forced', async () => {
    let discoveries = 0;
    const directory = new WorkspaceDirectory(defaultPath, {
      discover: async () => {
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
      },
    });

    expect((await directory.list())[0]?.status).toBe('running');
    expect((await directory.list())[0]?.status).toBe('running');
    expect(discoveries).toBe(1);
    expect((await directory.list(true))[0]?.status).toBe('offline');
    expect(discoveries).toBe(2);
  });

  it('does not rediscover weavers while routing selected-workspace resources', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-02T05:37:00Z'));
      let discoveries = 0;
      const directory = new WorkspaceDirectory(defaultPath, {
        discover: async () => {
          discoveries += 1;
          return parseWorkspaces([{ config_dir: defaultPath, state: 'running' }], defaultPath);
        },
      });

      await directory.list();
      vi.advanceTimersByTime(60_000);
      await directory.select(workspaceId(defaultPath));
      expect(discoveries).toBe(1);

      await directory.list(true);
      expect(discoveries).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves lifecycle operations from known IDs, including offline workspaces', async () => {
    const calls: string[][] = [];
    const directory = new WorkspaceDirectory(defaultPath, {
      discover: async () => parseWorkspaces([], defaultPath),
      run: async (operation, path) => {
        calls.push([operation, path]);
      },
    });
    await expect(directory.operate('/unregistered/.millstrand', 'start')).rejects.toMatchObject({
      status: 404,
    });
    expect(calls).toEqual([]);
    await directory.operate(workspaceId(defaultPath), 'start');
    expect(calls).toEqual([['start', defaultPath]]);
  });

  it('rejects selected-workspace access while its lifecycle operation is running', async () => {
    let releaseOperation: () => void = uninitializedSignal;
    const operationSettled = new Promise<void>((resolve) => {
      releaseOperation = resolve;
    });
    let operationStarted: () => void = uninitializedSignal;
    const operationRunning = new Promise<void>((resolve) => {
      operationStarted = resolve;
    });
    const directory = new WorkspaceDirectory(defaultPath, {
      discover: async () =>
        parseWorkspaces([{ config_dir: defaultPath, state: 'running' }], defaultPath),
      run: async () => {
        operationStarted();
        await operationSettled;
      },
    });
    const id = workspaceId(defaultPath);

    const operation = directory.operate(id, 'restart');
    await operationRunning;
    await expect(directory.select(id)).rejects.toMatchObject({ status: 503 });
    await expect(directory.operate(id, 'stop')).rejects.toMatchObject({ status: 409 });

    releaseOperation();
    await operation;
    await expect(directory.select(id)).resolves.toMatchObject({ path: defaultPath });
  });

  it('reports command failures without retrying and expires discovery afterwards', async () => {
    let discoveries = 0;
    let commands = 0;
    const directory = new WorkspaceDirectory(defaultPath, {
      discover: async () => {
        discoveries += 1;
        return parseWorkspaces([], defaultPath);
      },
      run: async () => {
        commands += 1;
        throw new Error('mill unavailable');
      },
    });
    await expect(directory.operate(workspaceId(defaultPath), 'restart')).rejects.toThrow(
      'Refresh status before trying again: mill unavailable',
    );
    expect(commands).toBe(1);
    await directory.list();
    expect(discoveries).toBe(2);
  });
});
