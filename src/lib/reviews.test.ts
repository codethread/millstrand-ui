import { describe, expect, it } from 'vitest';
import type { AgentIdentity } from '../../shared/api';
import { parseReviewDetail, parseReviewList } from '../../server/reviews';
import { review } from '../../server/reviews.fixture';
import {
  reviewDetailModel,
  reviewDirectoryContent,
  reviewInboxCount,
  reviewInboxModel,
  reviewPromptTarget,
  reviewerRunIdentities,
  selectReviews,
} from './reviews';
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

  it('keeps unsupported directories distinct from available content', () => {
    const unsupported = { kind: 'unsupported' as const, message: 'Review spool unavailable' };
    expect(reviewDirectoryContent(unsupported)).toBe(unsupported);
    expect(
      reviewDirectoryContent({
        kind: 'available',
        workspace: { path: '/workspace/.millstrand', name: 'Workspace' },
        fetchedAt: '2026-09-16T12:00:00Z',
        reviews: rows,
      }),
    ).toEqual({ kind: 'available', reviews: rows });
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

  it('derives counts, filtering, and user-facing empty states once', () => {
    expect(reviewInboxModel(rows, { scope: 'inbox', stage: 'failed', query: '' })).toMatchObject({
      inboxCount: 3,
      totalCount: 4,
      reviews: [],
      empty: 'matching',
    });
    expect(reviewInboxModel([], { scope: 'inbox', stage: null, query: '' }).empty).toBe('inbox');
    expect(reviewInboxModel([], { scope: 'all', stage: null, query: '' }).empty).toBe('all');
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

describe('review detail projections', () => {
  const detail = parseReviewDetail({
    review: {
      ...review,
      current: false,
      report: null,
      worktree: '/workspace/review',
      reviewers: [
        {
          ...review.reviewers[0],
          runId: 'run-1',
          result: '# Reviewer result',
          error: null,
        },
      ],
      notes: [{ id: 'note-1', text: 'Activity', at: null, by: null, kind: null }],
      links: [{ id: 'feature-1', title: 'Feature', type: 'kanban' }],
      history: [review],
    },
  });
  const identities: AgentIdentity[] = [
    {
      id: 'agent-1',
      strandId: 'identity-1',
      harness: 'pi',
      model: null,
      effort: null,
      createdAt: '2026-09-16T12:00:00Z',
      work: [],
      runs: [
        {
          id: 'run-1',
          requestId: null,
          title: 'Review',
          alias: 'reviewer',
          harness: 'pi',
          status: 'stopped',
          substatus: 'completed',
          mode: 'headless',
          model: null,
          effort: null,
          cwd: null,
          target: 'r123',
          rootTargets: [],
          createdAt: '2026-09-16T12:00:00Z',
          startedAt: null,
          finishedAt: null,
        },
        {
          id: 'unrelated-run',
          requestId: null,
          title: 'Other',
          alias: 'reviewer',
          harness: 'pi',
          status: 'running',
          substatus: null,
          mode: 'headless',
          model: null,
          effort: null,
          cwd: null,
          target: null,
          rootTargets: [],
          createdAt: '2026-09-16T12:00:00Z',
          startedAt: null,
          finishedAt: null,
        },
      ],
    },
  ];

  it('preserves outdated pending status and the stage-specific empty report message', () => {
    expect(reviewDetailModel(detail)).toMatchObject({
      heading: 'Fix race',
      currentness: { kind: 'outdated', pendingDecision: true },
      report: {
        kind: 'empty',
        message: 'The final report will appear here when it is ready.',
      },
      promptTarget: { kind: 'review', id: 'r123' },
    });
    expect(reviewDetailModel({ ...detail, stage: 'failed' }).report).toEqual({
      kind: 'empty',
      message: 'No final report was produced. Inspect the reviewer evidence below.',
    });
  });

  it('projects only identities that can open a reviewer run', () => {
    expect(reviewerRunIdentities(detail, identities)).toEqual({ 'run-1': 'agent-1' });
    expect(reviewerRunIdentities({ ...detail, reviewers: [] }, identities)).toEqual({});
  });
});
