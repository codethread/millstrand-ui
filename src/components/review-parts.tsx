import type { ReviewSummary } from '../../shared/reviews';
import { reviewLabel } from '../lib/reviews';
import { cn } from '../lib/utils';

export function ReviewStatus({ review }: { review: ReviewSummary }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-medium',
        review.stage === 'reviewed' &&
          review.decision === 'pending' &&
          'border-emerald-200 bg-emerald-50 text-emerald-800',
        review.stage === 'failed' && 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      {reviewLabel(review)}
    </span>
  );
}
