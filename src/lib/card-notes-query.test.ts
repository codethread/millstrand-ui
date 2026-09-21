import { QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { cardNotesQueryOptions } from './api/cards';
import { createQueryClient } from './api/query-client';

afterEach(() => vi.unstubAllGlobals());

const options = (visible: boolean) => ({
  ...cardNotesQueryOptions('workspace', 'card', visible),
  retry: false,
});

it('fetches full notes only while the Notes tab is visible and retains them on failure', async () => {
  const fetch = vi.fn(async () => Response.json([]));
  vi.stubGlobal('fetch', fetch);
  const client = createQueryClient();
  const owner = new QueryObserver(client, options(false));
  const stop = owner.subscribe(() => {});
  expect(fetch).not.toHaveBeenCalled();

  owner.setOptions(options(true));
  await owner.refetch();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/cards/card/notes?workspace=workspace',
    undefined,
  );
  const snapshot = owner.getCurrentResult().data;
  fetch.mockRejectedValue(new Error('Notes unavailable'));
  await owner.refetch();
  expect(owner.getCurrentResult().data).toBe(snapshot);
  expect(owner.getCurrentResult().error?.message).toBe('Notes unavailable');

  owner.setOptions(options(false));
  await client.invalidateQueries({ queryKey: ['card-notes', 'workspace'] });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(owner.options.refetchInterval).toBe(false);
  stop();
  client.clear();
});
