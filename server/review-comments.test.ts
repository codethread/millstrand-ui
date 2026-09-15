import { expect, it } from 'vitest';
import {
  parseCurateReview,
  parseReviewComments,
  parseReviewCommentPosition,
} from './review-comments';
import { commentsFixture } from './review-comments.fixture';

const position = { kind: 'line', oldPath: 'old.ts', newPath: 'new.ts', side: 'new', line: 12 };
it('accepts real fixture nullable branches and omitted severity/publication optional fields', () => {
  const comment = commentsFixture.comments[0];
  if (!comment) throw new Error('Missing fixture comment');
  const { severity: _severity, ...withoutSeverity } = comment;
  const result = parseReviewComments({
    ...commentsFixture,
    review: {
      ...commentsFixture.review,
      mr: { ...commentsFixture.review.mr, sourceBranch: null, targetBranch: null },
    },
    comments: [{ ...withoutSeverity, publication: { state: 'unpublished', retryable: true } }],
  });
  expect(result.review.mr).toMatchObject({ sourceBranch: null, targetBranch: null });
  expect(result.comments[0]).toMatchObject({
    severity: null,
    publication: { discussionId: null, error: null },
  });
});
it('preserves original text, version and discriminated candidate provenance', () => {
  const parsed = parseReviewComments(commentsFixture);
  expect(parsed.comments[0]?.candidate).toEqual(commentsFixture.comments[0]?.candidate);
  const adopted = structuredClone(commentsFixture);
  const comment = adopted.comments[0];
  if (!comment) throw new Error('Fixture missing');
  expect(
    parseReviewComments({
      ...adopted,
      comments: [
        {
          ...comment,
          candidate: {
            ...comment.candidate,
            source: { kind: 'user-adopted', by: 'millstrand-ui', at: '2026-09-15' },
          },
        },
      ],
    }).comments[0]?.candidate.source,
  ).toEqual({ kind: 'user-adopted', by: 'millstrand-ui', at: '2026-09-15' });
});
it('rejects duplicate identity and invalid curation or candidate versions', () => {
  expect(() =>
    parseReviewComments({
      ...commentsFixture,
      comments: [...commentsFixture.comments, ...commentsFixture.comments],
    }),
  ).toThrow('Duplicate');
  expect(() =>
    parseCurateReview({
      revision: 'rev',
      expectedVersion: -1,
      by: 'ui',
      changes: [{ id: 'c', inclusion: 'included' }],
    }),
  ).toThrow();
  expect(() =>
    parseCurateReview({
      revision: 'rev',
      expectedVersion: 1,
      by: 'ui',
      changes: [{ id: 'c', inclusion: 'included', candidate: { expectedVersion: 1, text: ' ' } }],
    }),
  ).toThrow();
});
it('normalizes absent/null ranges and preserves explicit same-side ranges', () => {
  expect(parseReviewCommentPosition(position)).toMatchObject({ start: null });
  expect(
    parseReviewCommentPosition({ ...position, startSide: null, startLine: null }),
  ).toMatchObject({ start: null });
  expect(
    parseReviewCommentPosition({ ...position, side: 'old', startSide: 'old', startLine: 10 }),
  ).toMatchObject({ side: 'old', start: { side: 'old', line: 10 } });
});
it.each([
  null,
  [],
  { kind: 'guess' },
  { kind: 'general', reason: ' ' },
  { kind: 'unsupported', reason: 'No anchor', line: 1 },
  { ...position, side: 'both' },
  { ...position, oldPath: '' },
  { ...position, line: 0 },
  { ...position, line: 1.5 },
  { ...position, line: Number.MAX_SAFE_INTEGER + 1 },
  { ...position, startSide: 'new' },
  { ...position, startLine: 10 },
  { ...position, startSide: 'old', startLine: 10 },
  { ...position, startSide: 'new', startLine: 13 },
  { ...position, startSide: 'new', startLine: -1 },
])('rejects malformed position or range %j', (value) => {
  expect(() => parseReviewCommentPosition(value)).toThrow();
});
