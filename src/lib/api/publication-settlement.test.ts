import { afterEach, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { reviewPublishMutationOptions } from './review-comments';

afterEach(() => vi.unstubAllGlobals());

function unresolvedSignal(): never {
  throw new Error('Signal resolver was not initialized');
}

it.each([true, false])(
  'keeps publication pending through receipt refresh after success=%s',
  async (success) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (!success) throw new Error('Outcome unknown');
        return Response.json({ state: 'partial' });
      }),
    );
    const client = new QueryClient();
    let releaseRefresh: () => void = unresolvedSignal;
    const refresh = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let startedRefresh: () => void = unresolvedSignal;
    const started = new Promise<void>((resolve) => {
      startedRefresh = resolve;
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(() => {
      startedRefresh();
      return refresh;
    });
    const observer = new MutationObserver(
      client,
      reviewPublishMutationOptions(client, 'original', 'r1'),
    );
    const pending = observer.mutate({ revision: 'frozen', curationVersion: 3 }).catch(() => {});
    await started;
    expect(observer.getCurrentResult().status).toBe('pending');
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: ['review-comments', 'original', 'r1'] }],
      [{ queryKey: ['review', 'original', 'r1'] }],
      [{ queryKey: ['reviews', 'original'] }],
    ]);
    releaseRefresh();
    await pending;
    expect(observer.getCurrentResult().status).toBe(success ? 'success' : 'error');
    client.clear();
  },
);
