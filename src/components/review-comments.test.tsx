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
  proposalError: null as Error | null,
}));
vi.mock('../lib/navigation', () => ({ useWorkspaceId: () => 'weaver' }));
vi.mock('../hooks/use-review-comments', () => ({
  useReviewCommentsRead: () => ({
    kind: 'ready',
    snapshot: parseReviewComments(commentsFixture),
    refreshing: false,
    readError: null,
    retry: controls.refetch,
  }),
  useReviewProposals: () => ({
    kind: controls.proposalError ? 'partial' : 'ready',
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
    ...(controls.proposalError ? { error: controls.proposalError } : {}),
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

it('keeps available proposals visible when another proposal read fails', () => {
  controls.proposalError = new Error('Reply unavailable');
  const html = renderToStaticMarkup(<ReviewComments id="review1" />);
  expect(html).toContain('Agent proposals could not refresh: Reply unavailable');
  expect(html).toContain('Showing the proposals that remain available');
  expect(html).toContain('Proposed alternative wording');
  controls.proposalError = null;
});
