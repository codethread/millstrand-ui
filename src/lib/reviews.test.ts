import { describe, expect, it } from 'vitest';
import { parseReviewList } from '../../server/reviews';
import { review } from '../../server/reviews.fixture';
import { selectReviews } from './reviews';
import { parseDashboardSearch, workspaceDestination, manualFilterSearch } from './dashboard-search';
import { emptyFilter } from './board';
describe('review inbox', () => {
  const rows = parseReviewList({
    reviews: [
      review,
      { ...review, id: 'older', current: false },
      { ...review, id: 'done', decision: 'done', state: 'closed' },
      { ...review, id: 'running', stage: 'running' },
    ],
  });
  it('keeps outdated undecided reviews in the inbox and retains completed history in all', () => {
    expect(selectReviews(rows, 'inbox', null, '').map((row) => row.id)).toEqual([
      'older',
      'r123',
      'running',
    ]);
    expect(selectReviews(rows, 'all', null, '')).toHaveLength(4);
  });
  it('combines stage with case-insensitive terms across MR and reviewer metadata', () => {
    expect(
      selectReviews(rows, 'inbox', 'reviewed', 'FIX REVIEWER 12').map((row) => row.id),
    ).toEqual(['older', 'r123']);
    expect(selectReviews(rows, 'all', null, 'missing')).toEqual([]);
  });
  it('keeps selection and filters shareable, resets them across workspaces, and exits for issue filters', () => {
    const search = parseDashboardSearch({
      mode: 'reviews',
      review: 'r123',
      reviewScope: 'all',
      reviewStage: 'reviewed',
      reviewQuery: 'race',
    });
    expect(search).toMatchObject({
      mode: 'reviews',
      review: 'r123',
      reviewScope: 'all',
      reviewStage: 'reviewed',
      reviewQuery: 'race',
    });
    expect(parseDashboardSearch({ reviewScope: 'bad', reviewStage: 'bad' })).toMatchObject({
      reviewScope: 'inbox',
      reviewStage: null,
    });
    expect(workspaceDestination('new', { kind: 'board' })).toMatchObject({
      review: null,
      reviewScope: 'inbox',
      reviewQuery: '',
    });
    expect(manualFilterSearch(search, emptyFilter()).mode).toBe('board');
  });
});
