import { CheckCheck, GitPullRequest, Search, X } from 'lucide-react';
import { reviewStages, type ReviewScope, type ReviewSummary } from '../../shared/reviews';
import { formatDate } from '../lib/board';
import { useDashboardActions, useReviewQuery, useReviewStage } from '../lib/navigation';
import type { ReviewInboxModel } from '../lib/reviews';
import { cn } from '../lib/utils';
import { Input } from './ui/input';
import { ReviewStatus } from './review-parts';

export function ReviewSearchControls() {
  const reviewQuery = useReviewQuery();
  const reviewStage = useReviewStage();
  const { setReviewQuery, setReviewStage } = useDashboardActions();
  return (
    <div className="toolbar-actions">
      <div className="search-field">
        <Search />
        <Input
          id="review-search"
          aria-label="Search reviews"
          placeholder="MR, repository, reviewer…"
          value={reviewQuery}
          onChange={(event) => setReviewQuery(event.target.value)}
        />
        {reviewQuery && (
          <button aria-label="Clear review search" onClick={() => setReviewQuery('')}>
            <X className="size-3" />
          </button>
        )}
      </div>
      <select
        aria-label="Review stage"
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        value={reviewStage ?? ''}
        onChange={(event) =>
          setReviewStage(reviewStages.find((stage) => stage === event.target.value) ?? null)
        }
      >
        <option value="">Every stage</option>
        {reviewStages.map((stage) => (
          <option key={stage} value={stage}>
            {stage === 'reviewed'
              ? 'Ready to read'
              : stage.charAt(0).toUpperCase() + stage.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyInbox({ empty }: { empty: Exclude<ReviewInboxModel['empty'], null> }) {
  const heading =
    empty === 'matching'
      ? 'No matching reviews'
      : empty === 'inbox'
        ? 'Your review inbox is clear'
        : 'No reviews yet';
  const body =
    empty === 'matching'
      ? 'Try another search or stage.'
      : empty === 'inbox'
        ? 'Reviews awaiting a local decision appear here, including outdated revisions. Browse all reviews for completed and older revisions.'
        : 'Reviews created through strand will appear here.';
  return (
    <div className="p-7 text-center">
      <GitPullRequest className="mx-auto mb-3 size-7 text-muted-foreground" />
      <h3 className="text-sm font-medium">{heading}</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}

function ReviewInboxRow({
  review,
  selected,
  onSelect,
}: {
  review: ReviewSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'block w-full border-b border-border p-4 text-left hover:bg-muted/50',
        selected && 'bg-muted',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ReviewStatus review={review} />
        {!review.current && (
          <span className="text-[10px] text-amber-700 dark:text-amber-300">Outdated</span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {review.mr.iid !== null ? `!${review.mr.iid}` : review.id}
        </span>
      </div>
      <h3 className="break-words text-sm leading-5 font-medium">
        {review.mr.title ?? review.title}
      </h3>
      <p className="mt-2 truncate text-xs text-muted-foreground">
        {review.repo ?? 'Repository unavailable'}
      </p>
      <div className="mt-3 flex gap-2 text-[10px] text-muted-foreground">
        <span>{review.reviewers.length} reviewers</span>
        <span>· {formatDate(review.createdAt)}</span>
        {review.reportAvailable && <CheckCheck className="ml-auto size-3.5 text-emerald-600" />}
      </div>
    </button>
  );
}

export interface ReviewInboxProps {
  model: ReviewInboxModel;
  scope: ReviewScope;
  selectedReview: string | null;
  onSelect: (id: string) => void;
  onScopeChange: (scope: ReviewScope) => void;
}

export function ReviewInbox({
  model,
  scope,
  selectedReview,
  onSelect,
  onScopeChange,
}: ReviewInboxProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 w-full shrink-0 flex-col border-r border-border md:w-80 lg:w-96',
        selectedReview && 'hidden md:flex',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border p-3">
        {(['inbox', 'all'] as const).map((candidate) => (
          <button
            key={candidate}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium',
              scope === candidate
                ? 'bg-primary text-background'
                : 'text-muted-foreground hover:bg-muted',
            )}
            aria-pressed={scope === candidate}
            onClick={() => onScopeChange(candidate)}
          >
            {candidate === 'inbox' ? 'Inbox' : 'All reviews'}{' '}
            <span className="ml-1 opacity-70">
              {candidate === 'inbox' ? model.inboxCount : model.totalCount}
            </span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {model.reviews.map((review) => (
          <ReviewInboxRow
            key={review.id}
            review={review}
            selected={selectedReview === review.id}
            onSelect={() => onSelect(review.id)}
          />
        ))}
        {model.empty !== null && <EmptyInbox empty={model.empty} />}
      </div>
    </div>
  );
}
