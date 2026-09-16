import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ReviewPublication } from './review-publication';
import { parseReviewComments } from '../../server/review-comments';
import { commentsFixture } from '../../server/review-comments.fixture';

const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  data: undefined,
  error: null as Error | null,
}));
vi.mock('../lib/navigation', () => ({ useDashboardNavigation: () => ({ workspace: 'weaver' }) }));
vi.mock('../hooks/use-review-comments', () => ({
  usePublishReview: () => mutation,
  useReviewMutationPending: () => false,
}));
it('never dispatches on render and disables send until drafts have loaded', () => {
  const html = renderToStaticMarkup(
    <ReviewPublication
      snapshot={parseReviewComments(commentsFixture)}
      refreshing={false}
      readError={false}
    />,
  );
  expect(html).toContain('Loading saved review drafts');
  expect(html).toContain('disabled=""');
  expect(mutation.mutate).not.toHaveBeenCalled();
});
it('exposes uncertain outcomes and persisted receipts without silently resending', () => {
  mutation.error = new Error('Request timed out');
  const snapshot = parseReviewComments(commentsFixture);
  snapshot.review.publication.state = 'partial';
  snapshot.comments[0]!.publication = {
    state: 'reconciling',
    discussionId: null,
    retryable: false,
    error: 'Confirm remote receipt',
  };
  const html = renderToStaticMarkup(
    <ReviewPublication snapshot={snapshot} refreshing={false} readError={false} />,
  );
  expect(html).toContain('Send outcome is uncertain');
  expect(html).toContain('Retry Send review');
  expect(html).toContain('Confirm remote receipt');
  expect(mutation.mutate).not.toHaveBeenCalled();
  mutation.error = null;
});
