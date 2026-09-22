import { sorted } from '../../shared/array';
import type {
  ReviewDetail,
  ReviewDirectory,
  ReviewScope,
  ReviewStage,
  ReviewSummary,
} from '../../shared/reviews';

export type ReviewDirectoryContent =
  | Extract<ReviewDirectory, { kind: 'unsupported' }>
  | { kind: 'available'; reviews: ReviewSummary[] };

export interface ReviewInboxFilters {
  scope: ReviewScope;
  stage: ReviewStage | null;
  query: string;
}

export type ReviewInboxEmpty = 'matching' | 'inbox' | 'all' | null;

export interface ReviewInboxModel {
  reviews: ReviewSummary[];
  inboxCount: number;
  totalCount: number;
  empty: ReviewInboxEmpty;
}

export type ReviewReportState =
  { kind: 'available'; markdown: string } | { kind: 'empty'; message: string };

export type ReviewCurrentness =
  { kind: 'current' } | { kind: 'outdated'; pendingDecision: boolean };

export interface ReviewDetailModel {
  review: ReviewDetail;
  heading: string;
  report: ReviewReportState;
  currentness: ReviewCurrentness;
}

export function reviewDirectoryContent(directory: ReviewDirectory): ReviewDirectoryContent {
  return directory.kind === 'unsupported'
    ? directory
    : { kind: 'available', reviews: directory.reviews };
}

export function reviewInInbox(review: ReviewSummary): boolean {
  return review.state === 'active' && review.decision === 'pending';
}

export function reviewInboxCount(directory: ReviewDirectory): number | null {
  return directory.kind === 'available' ? directory.reviews.filter(reviewInInbox).length : null;
}

export function reviewLabel(review: ReviewSummary): string {
  if (review.decision === 'done') return 'Done';
  if (review.decision === 'dismissed') return 'Dismissed';
  if (review.stage === 'reviewed') return 'Ready to read';
  if (review.stage === 'failed') return 'Needs attention';
  return review.stage.charAt(0).toUpperCase() + review.stage.slice(1);
}

export function selectReviews(
  reviews: ReviewSummary[],
  scope: ReviewScope,
  stage: ReviewStage | null,
  query: string,
): ReviewSummary[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return sorted(
    reviews.filter((review) => {
      if (scope === 'inbox' && !reviewInInbox(review)) return false;
      if (stage !== null && review.stage !== stage) return false;
      const text = [
        review.id,
        review.title,
        review.repo,
        review.mr.iid,
        review.mr.title,
        review.mr.sha,
        review.mr.sourceBranch,
        review.stage,
        review.decision,
        ...review.reviewers.map((seat) => seat.name),
      ]
        .join(' ')
        .toLowerCase();
      return terms.every((term) => text.includes(term));
    }),
    (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.id.localeCompare(b.id),
  );
}

export function reviewInboxModel(
  reviews: ReviewSummary[],
  filters: ReviewInboxFilters,
): ReviewInboxModel {
  const selected = selectReviews(reviews, filters.scope, filters.stage, filters.query);
  const filtered = filters.query.trim() !== '' || filters.stage !== null;
  return {
    reviews: selected,
    inboxCount: reviews.filter(reviewInInbox).length,
    totalCount: reviews.length,
    empty:
      selected.length > 0
        ? null
        : filtered
          ? 'matching'
          : filters.scope === 'inbox'
            ? 'inbox'
            : 'all',
  };
}

function emptyReportMessage(stage: ReviewStage): string {
  return stage === 'failed'
    ? 'No final report was produced. Inspect the reviewer evidence below.'
    : 'The final report will appear here when it is ready.';
}

export function reviewDetailModel(review: ReviewDetail): ReviewDetailModel {
  return {
    review,
    heading: review.mr.title ?? review.title,
    report:
      review.report === null
        ? { kind: 'empty', message: emptyReportMessage(review.stage) }
        : { kind: 'available', markdown: review.report },
    currentness: review.current
      ? { kind: 'current' }
      : { kind: 'outdated', pendingDecision: review.decision === 'pending' },
  };
}
