import { afterEach, expect, it, vi } from 'vitest';
import { QueryObserver } from '@tanstack/react-query';
import type { WorkspaceOption } from '../../shared/api';
import { createQueryClient } from './api/query-client';
import { workspaceQueryOptions, workspaceReaderOptions } from './api/workspaces';
import {
  matchingWorkspaces,
  selectedWorkspace,
  visibleWorkspaces,
  hiddenWorkspaces,
  workspaceIsHidden,
} from './workspaces';

const options: WorkspaceOption[] = [
  { id: 'a', name: 'Alpha', path: '/projects/alpha/.millstrand', status: 'running' },
  { id: 'b', name: 'Beta', path: '/projects/beta/.millstrand', status: 'offline' },
];
afterEach(() => vi.unstubAllGlobals());

it('prefers the URL identity, using the startup path only before the URL is pinned', () => {
  expect(selectedWorkspace(options, 'b', options[0]!.path)).toBe(options[1]);
  expect(selectedWorkspace(options, null, options[0]!.path)).toBe(options[0]);
  expect(selectedWorkspace(options, 'missing', options[0]!.path)).toBeNull();
  expect(selectedWorkspace([], null, null)).toBeNull();
});

it('matches names and paths case-insensitively without dropping offline weavers', () => {
  expect(matchingWorkspaces(options, '')).toBe(options);
  expect(matchingWorkspaces(options, 'BETA')).toEqual([options[1]]);
  expect(matchingWorkspaces(options, '/projects/alpha')).toEqual([options[0]]);
  expect(matchingWorkspaces(options, 'missing')).toEqual([]);
});

it('shares discovery with projection readers and retains selected data after a failed refresh', async () => {
  const fetch = vi.fn(async () => Response.json(options));
  vi.stubGlobal('fetch', fetch);
  const client = createQueryClient();
  const owner = new QueryObserver(client, { ...workspaceQueryOptions(), retry: false });
  const reader = new QueryObserver(client, {
    ...workspaceReaderOptions(),
    select: (data) => selectedWorkspace(data, 'a', null),
  });
  const stopReader = reader.subscribe(() => {});
  expect(fetch).not.toHaveBeenCalled();
  const stopOwner = owner.subscribe(() => {});
  await owner.refetch();
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/workspaces?refresh', undefined);
  const selected = reader.getCurrentResult().data;
  expect(selected).toEqual(options[0]);

  fetch.mockImplementation(async () => Response.json([options[0], { ...options[1], name: 'New' }]));
  await client.invalidateQueries({ queryKey: workspaceQueryOptions().queryKey });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(reader.getCurrentResult().data).toBe(selected);

  fetch.mockRejectedValue(new Error('Discovery offline'));
  await owner.refetch();
  expect(reader.getCurrentResult().data).toBe(selected);
  expect(reader.getCurrentResult().error?.message).toBe('Discovery offline');
  stopOwner();
  stopReader();
  client.clear();
});

it('puts pins first, excludes hidden weavers even from search, and preserves discovery order', () => {
  const pinned = { b: { kind: 'pinned' as const, name: 'Beta', path: '/b' } };
  expect(visibleWorkspaces(options, pinned)).toEqual([options[1], options[0]]);
  const preferences = { ...pinned, a: { kind: 'hidden' as const, name: 'Alpha', path: '/a' } };
  expect(visibleWorkspaces(options, preferences)).toEqual([options[1]]);
  expect(matchingWorkspaces(visibleWorkspaces(options, preferences), 'Alpha')).toEqual([]);
  expect(options.map((option) => option.id)).toEqual(['a', 'b']);
  expect(hiddenWorkspaces(preferences)).toEqual([{ id: 'a', name: 'Alpha', path: '/a' }]);
  expect(workspaceIsHidden('a', preferences)).toBe(true);
  expect(workspaceIsHidden('b', preferences)).toBe(false);
  expect(workspaceIsHidden(null, preferences)).toBe(true);
  expect(workspaceIsHidden(null, pinned)).toBe(false);
});
