import { expect, it } from 'vitest';
import type { AgentReply } from '../../shared/api';
import { commentsFixture } from '../../server/review-comments.fixture';
import { parseReviewCommentPosition, parseReviewComments } from '../../server/review-comments';
import {
  reviewCommentCandidateConflict,
  reviewCommentModels,
  reviewCommentPositionLabel,
  reviewCommentPositionValidation,
} from './review-comments';

it('formats the authoritative side path and full range without guessing renamed paths', () => {
  const position = { kind: 'line', oldPath: 'before.ts', newPath: 'after.ts', line: 20 };
  expect(reviewCommentPositionLabel(parseReviewCommentPosition({ ...position, side: 'old' }))).toBe(
    'before.ts · old line 20',
  );
  expect(
    reviewCommentPositionLabel(
      parseReviewCommentPosition({ ...position, side: 'new', startSide: 'new', startLine: 18 }),
    ),
  ).toBe('after.ts · new lines 18–20');
});
it('keeps general and unsupported reasons explicit without claiming diff validation', () => {
  const general = parseReviewCommentPosition({ kind: 'general', reason: 'Architecture' });
  const unsupported = parseReviewCommentPosition({ kind: 'unsupported', reason: 'Binary file' });
  expect(reviewCommentPositionLabel(general)).toBe('General discussion · Architecture');
  expect(reviewCommentPositionValidation(general)).toBeNull();
  expect(reviewCommentPositionLabel(unsupported)).toBe('Unsupported position · Binary file');
  expect(reviewCommentPositionValidation(unsupported)).toContain('Cannot publish');
});

it('builds mutation-safe comment models and keeps only proposals for the frozen comment revision', () => {
  const snapshot = parseReviewComments(commentsFixture);
  const proposal = {
    id: 'proposal1',
    title: 'Proposal',
    alias: 'reviewer',
    identity: 'bright-quick-fox',
    target: 'review1',
    status: 'stopped',
    substatus: null,
    result: 'Revised wording',
    error: null,
    prompt: {
      kind: 'review-comment',
      cardId: 'review1',
      comment: { id: 'comment1', revision: 'frozen-head', candidateVersion: 1 },
      text: 'Revise',
      context: 'Pointers',
    },
  } satisfies AgentReply;
  const wrongRevision = {
    ...proposal,
    id: 'proposal2',
    prompt: {
      ...proposal.prompt,
      comment: { ...proposal.prompt.comment, revision: 'new-head' },
    },
  } satisfies AgentReply;
  const [model] = reviewCommentModels(snapshot, [proposal, wrongRevision]);
  expect(model?.curation).toEqual({
    reviewId: 'review1',
    revision: 'frozen-head',
    curationVersion: 1,
    mutable: true,
  });
  expect(model?.proposals).toEqual([{ reply: proposal, candidateVersion: 1 }]);
  expect(reviewCommentCandidateConflict(1, 2)).toBe(true);
  expect(reviewCommentCandidateConflict(2, 2)).toBe(false);
});
