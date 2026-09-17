import { afterEach, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import type { ReviewPublicationReceipt } from '../../shared/review-comments';
import { reviewPublishMutationOptions } from './api/review-comments';
import { useReviewCommentStore } from '../review-comment-store';

const partialReceipt = {
  reviewId: 'review1',
  revision: 'frozen',
  curationVersion: 3,
  state: 'partial',
  comments: [
    {
      id: 'comment1',
      state: 'failed',
      retryable: true,
      discussionId: null,
      error: 'Remote outcome unknown',
    },
  ],
} satisfies ReviewPublicationReceipt;

afterEach(() => {
  vi.unstubAllGlobals();
});
it.each([true, false])(
  'invalidates reads for success=%s, retaining drafts and avoiding automatic retry',
  async (success) => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const fetch = vi.fn(async () => {
      if (!success) throw new Error('Network outcome unknown');
      return Response.json(partialReceipt);
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', { setItem: vi.fn() });
    useReviewCommentStore.getState().open('publication-test', 'Unsaved draft', 1);
    const draft = useReviewCommentStore.getState().drafts['publication-test'];
    const observer = new MutationObserver(
      client,
      reviewPublishMutationOptions(client, 'weaver', 'review1'),
    );
    const input = { revision: 'frozen', curationVersion: 3 };
    await observer.mutate(input).catch(() => {});
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('/reviews/review1/publish'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['review-comments', 'weaver', 'review1'] });
    expect(useReviewCommentStore.getState().drafts['publication-test']).toEqual(draft);
    client.clear();
  },
);
