import { describe, expect, it } from 'vitest';
import { parseReviewList } from '../../server/reviews';
import { review } from '../../server/reviews.fixture';
import { reviewInboxCount, reviewPromptTarget, selectReviews } from './reviews';
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
    expect(
      reviewInboxCount({
        kind: 'available',
        workspace: { path: '/workspace/.millstrand', name: 'Workspace' },
        fetchedAt: '2026-09-16T12:00:00Z',
        reviews: rows,
      }),
    ).toBe(3);
    expect(reviewInboxCount({ kind: 'unsupported', message: 'Unavailable' })).toBeNull();
    expect(selectReviews(rows, 'inbox', null, '').map((row) => row.id)).toEqual([
      'older',
      'r123',
      'running',
    ]);
    expect(selectReviews(rows, 'all', null, '')).toHaveLength(4);
  });
  it('offers the existing prompt flow only for active pending reviews, including outdated ones', () => {
    const row = rows[0]!;
    expect(reviewPromptTarget(row)).toEqual({
      kind: 'review',
      cardId: row.id,
      id: row.id,
      title: row.title,
    });
    expect(reviewPromptTarget({ ...row, current: false })).not.toBeNull();
    expect(reviewPromptTarget({ ...row, stage: 'running' })).not.toBeNull();
    expect(reviewPromptTarget({ ...row, decision: 'done' })).toBeNull();
    expect(reviewPromptTarget({ ...row, decision: 'dismissed' })).toBeNull();
    expect(reviewPromptTarget({ ...row, state: 'closed' })).toBeNull();
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
