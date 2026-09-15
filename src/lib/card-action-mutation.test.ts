import { afterEach, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { cardActionMutationOptions } from './api';
import type { CardAction } from '../../shared/api';

afterEach(() => vi.unstubAllGlobals());

it.each([true, false])(
  'refreshes related reads after success=%s without retrying a destructive action',
  async (success) => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const fetch = vi.fn(async () => {
      if (!success) throw new Error('Network outcome unknown');
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', fetch);
    const observer = new MutationObserver(
      client,
      cardActionMutationOptions(client, 'selected-weaver'),
    );
    await observer.mutate({ id: 'card1', action: { kind: 'delete' } }).catch(() => {});
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/cards/card1?workspace=selected-weaver',
      expect.objectContaining({ method: 'DELETE' }),
    );
    for (const key of ['board', 'card', 'graph', 'agents'])
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key, 'selected-weaver'] });
    client.clear();
  },
);
it('sends only the lane to the selected workspace', async () => {
  const client = new QueryClient();
  const fetch = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  const action: CardAction = { kind: 'move', lane: 'in_production' };
  const observer = new MutationObserver(client, cardActionMutationOptions(client, 'other-weaver'));
  await observer.mutate({ id: 'card1', action });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/cards/card1/lane?workspace=other-weaver',
    expect.objectContaining({ method: 'PATCH', body: '{"lane":"in_production"}' }),
  );
  client.clear();
});
