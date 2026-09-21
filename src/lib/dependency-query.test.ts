import { QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { dependencyQueryOptions } from './api/cards';
import { createQueryClient } from './api/query-client';

afterEach(() => vi.unstubAllGlobals());

const options = (expanded: boolean) => ({
  ...dependencyQueryOptions('workspace', expanded),
  retry: false,
});

it('reads dependencies only during explicit expansion and retains the snapshot on refresh failure', async () => {
  const graph = { rootId: '', nodes: [], edges: [] };
  const fetch = vi.fn(async () => Response.json(graph));
  vi.stubGlobal('fetch', fetch);
  const client = createQueryClient();
  const owner = new QueryObserver(client, options(false));
  const stop = owner.subscribe(() => {});
  expect(fetch).not.toHaveBeenCalled();

  owner.setOptions(options(true));
  await owner.refetch();
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/dependencies?workspace=workspace', undefined);
  const snapshot = owner.getCurrentResult().data;
  expect(snapshot).toEqual(graph);

  fetch.mockRejectedValue(new Error('Refresh failed'));
  await owner.refetch();
  expect(owner.getCurrentResult().data).toBe(snapshot);
  expect(owner.getCurrentResult().error?.message).toBe('Refresh failed');

  owner.setOptions(options(false));
  await client.invalidateQueries({ queryKey: ['dependencies', 'workspace'] });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(owner.options.refetchInterval).toBe(false);
  stop();
  client.clear();
});
