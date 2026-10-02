import { QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { cardQueryOptions } from './api/cards';
import { createQueryClient } from './api/query-client';

afterEach(() => vi.unstubAllGlobals());

it('loads card detail on demand without an independent poll and honors invalidation', async () => {
  const fetch = vi.fn(async () => Response.json({ card: { id: 'card' } }));
  vi.stubGlobal('fetch', fetch);
  const client = createQueryClient();
  const owner = new QueryObserver(client, {
    ...cardQueryOptions('workspace', 'card'),
    retry: false,
  });
  const stop = owner.subscribe(() => {});

  await owner.refetch();
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/cards/card?workspace=workspace', undefined);
  expect(owner.options.refetchInterval).toBe(false);

  await client.invalidateQueries({ queryKey: ['card', 'workspace', 'card'], exact: true });
  expect(fetch).toHaveBeenCalledTimes(2);

  stop();
  client.clear();
});
