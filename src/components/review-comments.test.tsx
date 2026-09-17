import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { parseReviewComments } from '../../server/review-comments';
import { commentsFixture } from '../../server/review-comments.fixture';
import type { AgentReply } from '../../shared/api';
import { ReviewComments } from './review-comments';

const controls = vi.hoisted(() => ({
  mutate: vi.fn(),
  refetch: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('../lib/navigation', () => ({ useWorkspaceId: () => 'weaver' }));
vi.mock('../hooks/use-review-comments', () => ({
  useReviewComments: () => ({
    data: parseReviewComments(commentsFixture),
    error: null,
    isFetching: false,
    refetch: controls.refetch,
  }),
  useReviewProposals: () => ({
    error: null,
    replies: [
      {
        id: 'proposal1',
        title: 'Review comment proposal',
        alias: 'reviewer',
        identity: 'bright-quick-fox',
        target: 'review1',
        status: 'stopped',
        substatus: null,
        result: 'Proposed alternative wording',
        error: null,
        prompt: {
          kind: 'review-comment',
          cardId: 'review1',
          comment: { id: 'comment1', revision: 'frozen-head', candidateVersion: 1 },
          text: 'Revise',
          context: 'Pointers',
        },
      } satisfies AgentReply,
    ],
  }),
  useCurateReview: () => ({
    mutate: controls.mutate,
    reset: controls.reset,
    isPending: false,
    error: null,
  }),
  usePublishReview: () => ({
    mutate: controls.mutate,
    reset: controls.reset,
    isPending: false,
    error: null,
    data: undefined,
  }),
  useReviewMutationPending: () => false,
}));

it('shows completed proposals separately from canonical text without curating on arrival', () => {
  const html = renderToStaticMarkup(<ReviewComments id="review1" />);
  expect(html).toContain('Original comment');
  expect(html).toContain('Proposed alternative wording');
  expect(html).toContain('Inspect and edit proposal');
  expect(controls.mutate).not.toHaveBeenCalled();
});
