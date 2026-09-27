import { QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { dependencyQueryOptions } from './api/cards';
import { createQueryClient } from './api/query-client';

afterEach(() => vi.unstubAllGlobals());

const options = (expanded: string[]) => ({
  ...dependencyQueryOptions('workspace', expanded),
  retry: false,
});

it('reads only the expanded cards and retains the snapshot on refresh failure', async () => {
  const graph = { rootId: '', nodes: [], edges: [] };
  const fetch = vi.fn(async () => Response.json(graph));
  vi.stubGlobal('fetch', fetch);
  const client = createQueryClient();
  const owner = new QueryObserver(client, options([]));
  const stop = owner.subscribe(() => {});
  expect(fetch).not.toHaveBeenCalled();

  owner.setOptions(options(['card2', 'card1']));
  await owner.refetch();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/dependencies?card=card1&card=card2&workspace=workspace',
    undefined,
  );
  const snapshot = owner.getCurrentResult().data;
  expect(snapshot).toEqual(graph);

  fetch.mockRejectedValue(new Error('Refresh failed'));
  await owner.refetch();
  expect(owner.getCurrentResult().data).toBe(snapshot);
  expect(owner.getCurrentResult().error?.message).toBe('Refresh failed');

  owner.setOptions(options([]));
  await client.invalidateQueries({ queryKey: ['dependencies', 'workspace'] });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(owner.options.refetchInterval).toBe(false);
  stop();
  client.clear();
});
