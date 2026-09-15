import { expect, it } from 'vitest';
import { parseReviewCommentPosition } from '../../server/review-comments';
import { reviewCommentPositionLabel, reviewCommentPositionValidation } from './review-comments';

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
