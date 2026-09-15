import { describe, expect, it } from 'vitest';
import { parseReviewDetail, parseReviewList } from './reviews';
import { review } from './reviews.fixture';
describe('review CLI boundary', () => {
  it('normalizes authoritative headSha at the boundary', () => {
    expect(parseReviewList({ reviews: [review] })[0]?.mr.sha).toBe('abc');
    expect(
      parseReviewList({ reviews: [{ ...review, mr: { ...review.mr, headSha: 'new-head' } }] })[0]
        ?.mr.sha,
    ).toBe('new-head');
  });
  it('preserves full evidence and explicitly absent optional metadata', () => {
    const report = '# Findings\n' + 'Evidence '.repeat(1000);
    const parsed = parseReviewDetail({
      review: {
        ...review,
        report,
        worktree: null,
        reviewers: [{ ...review.reviewers[0], result: report, error: null }],
        notes: [{ id: 'n1', text: 'Decision', at: null, by: null, kind: null }],
        links: [{ id: 'c1', title: 'Feature', type: 'kanban' }],
        history: [review],
      },
    });
    expect(parsed.report).toBe(report);
    expect(parsed.reviewers[0]?.result).toBe(report);
    expect(parsed.mr.baseSha).toBeNull();
    expect(parsed.history[0]?.id).toBe('r123');
  });
  it('rejects malformed control fields and unsafe links', () => {
    for (const change of [
      { current: 'true' },
      { stage: 'surprise' },
      { decision: 'approved' },
      { mr: { ...review.mr, url: 'javascript:alert(1)' } },
    ])
      expect(() => parseReviewList({ reviews: [{ ...review, ...change }] })).toThrow();
  });
});
