import { useMemo } from 'react';
import { ArrowLeft, GitPullRequest } from 'lucide-react';
import { useAgentRunIdentities } from '../hooks/use-agents';
import {
  useReviewDetail,
  useReviewDetailPoll,
  useReviewDetailStatus,
  useReviewDirectory,
  useReviewsStatus,
} from '../hooks/use-reviews';
import {
  useDashboardActions,
  useReviewQuery,
  useReviewScope,
  useReviewStage,
  useSelectedReview,
} from '../lib/navigation';
import { reviewDetailModel, reviewInboxModel } from '../lib/reviews';
import { ErrorNotice, Loading } from './issue-parts';
import { ReviewComments } from './review-comments';
import { ReviewInbox } from './review-inbox';
import { ReviewReport } from './review-report';
import { Button } from './ui/button';

function ReviewDetailPoll({ id }: { id: string }) {
  useReviewDetailPoll(id);
  return null;
}

function SelectedReviewReport({ id }: { id: string }) {
  const detail = useReviewDetail(id).data;
  const runIdentities = useAgentRunIdentities().data ?? {};
  const model = useMemo(() => (detail ? reviewDetailModel(detail) : null), [detail]);
  const { openAgentRun, openCard, openReview } = useDashboardActions();
  if (model === null) return null;
  return (
    <ReviewReport
      model={model}
      reviewerRunIdentities={runIdentities}
      integrations={{
        comments: <ReviewComments id={model.review.id} />,
      }}
      onOpenAgentRun={openAgentRun}
      onOpenHistory={openReview}
      onOpenRelatedStrand={openCard}
    />
  );
}

function SelectedReview({ id }: { id: string }) {
  const status = useReviewDetailStatus(id);
  const { closeReview } = useDashboardActions();
  return (
    <article className="min-w-0 flex-1 overflow-y-auto bg-background" aria-label="Selected review">
      <ReviewDetailPoll id={id} />
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-background/95 px-4 py-2">
        <Button variant="ghost" size="sm" onClick={closeReview}>
          <ArrowLeft />
          Back to reviews
        </Button>
      </div>
      {status.error && (
        <div className="p-4">
          <ErrorNotice error={status.error} />
          {status.data && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the last successful review. Refresh failed.
            </p>
          )}
          <Button
            className="mt-2"
            variant="outline"
            size="sm"
            onClick={() => void status.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      {status.data ? (
        <SelectedReviewReport id={id} />
      ) : (
        !status.error && <Loading text="Loading review evidence…" />
      )}
    </article>
  );
}

function UnsupportedReviews({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <GitPullRequest className="size-8 text-muted-foreground" />
      <h2 className="font-semibold">Reviews are not configured</h2>
      <p className="max-w-lg text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function ReviewsView() {
  const directory = useReviewDirectory();
  const status = useReviewsStatus();
  const selectedReview = useSelectedReview();
  const reviewQuery = useReviewQuery();
  const reviewScope = useReviewScope();
  const reviewStage = useReviewStage();
  const { openReview, setReviewScope } = useDashboardActions();
  const content = directory.data;
  const model = useMemo(
    () =>
      content?.kind === 'available'
        ? reviewInboxModel(content.reviews, {
            scope: reviewScope,
            stage: reviewStage,
            query: reviewQuery,
          })
        : null,
    [content, reviewScope, reviewStage, reviewQuery],
  );

  if (!content && status.error)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="p-5">
          <ErrorNotice error={status.error} />
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            onClick={() => void status.refetch()}
          >
            Retry
          </Button>
        </div>
        {selectedReview && <SelectedReview key={selectedReview} id={selectedReview} />}
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {status.error && (
        <div className="border-b border-border p-3">
          <ErrorNotice error={status.error} />
          {content && (
            <p className="mt-1 text-xs text-muted-foreground">Showing last known reviews.</p>
          )}
          <Button variant="ghost" size="sm" onClick={() => void status.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {!content ? (
        <Loading text="Loading reviews…" />
      ) : content.kind === 'unsupported' ? (
        <UnsupportedReviews message={content.message} />
      ) : model ? (
        <div className="flex min-h-0 flex-1">
          <ReviewInbox
            model={model}
            scope={reviewScope}
            selectedReview={selectedReview}
            onSelect={openReview}
            onScopeChange={setReviewScope}
          />
          {selectedReview ? (
            <SelectedReview key={selectedReview} id={selectedReview} />
          ) : (
            <div className="hidden min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center md:flex">
              <GitPullRequest className="size-9 text-muted-foreground/60" />
              <h2 className="font-medium">A clear view of every review</h2>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Select a review to read its report, compare revisions, and inspect each reviewer’s
                evidence.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
