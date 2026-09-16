import type {
  ReviewDirectory,
  ReviewScope,
  ReviewStage,
  ReviewSummary,
} from '../../shared/reviews';
import { sorted } from '../../shared/array';
import type { PromptTarget } from '../agent-prompt-store';

export function reviewPromptTarget(review: ReviewSummary): PromptTarget | null {
  return reviewInInbox(review)
    ? { kind: 'review', cardId: review.id, id: review.id, title: review.title }
    : null;
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
