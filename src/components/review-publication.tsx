import { useEffect, useMemo, useState } from 'react';
import type { PublishReview, ReviewComments } from '../../shared/review-comments';
import { sendReviewBlock } from '../lib/review-publication';
import { usePublishReview, useReviewMutationPending } from '../lib/api';
import { useDashboardNavigation } from '../lib/navigation';
import { reviewDraftKey, useReviewCommentStore } from '../review-comment-store';
import { Button } from './ui/button';

export function ReviewPublication({
  snapshot,
  refreshing,
  readError,
}: {
  snapshot: ReviewComments;
  refreshing: boolean;
  readError: boolean;
}) {
  const { workspace } = useDashboardNavigation();
  const store = useReviewCommentStore();
  const loadDraft = store.load;
  const mutation = usePublishReview(snapshot.review.id);
  const curating = useReviewMutationPending(snapshot.review.id, 'curate');
  const [attempt, setAttempt] = useState<PublishReview | null>(null);
  const [hydrated, setHydrated] = useState<string | null>(null);
  const keys = useMemo(
    () =>
      snapshot.comments.map((comment) =>
        reviewDraftKey(workspace ?? '', snapshot.review.id, snapshot.review.revision, comment.id),
      ),
    [workspace, snapshot.comments, snapshot.review.id, snapshot.review.revision],
  );
  const signature = JSON.stringify(keys);
  useEffect(() => {
    for (const key of keys) loadDraft(key);
    // Loading browser storage is an external synchronization; record when this snapshot is done.
    // oxlint-disable-next-line react/set-state-in-effect
    setHydrated(signature);
  }, [keys, loadDraft, signature]);
  const unsaved = keys.some((key) => store.drafts[key]?.state.kind === 'editing');
  const changed =
    attempt !== null &&
    (attempt.revision !== snapshot.review.revision ||
      attempt.curationVersion !== snapshot.review.curation.version);
  const block = sendReviewBlock(snapshot, {
    hydrated: workspace !== null && hydrated === signature,
    storageError: keys.some((key) => store.errors[key] !== undefined),
    unsaved,
    refreshing: refreshing || curating,
    readError,
    snapshotChanged: changed,
  });
  const retry = attempt !== null || snapshot.review.publication.state !== 'unpublished';
  const published =
    snapshot.review.publication.state === 'published' || mutation.data?.state === 'published';
  const receipts = snapshot.comments.map((comment) => ({
    id: comment.id,
    ...comment.publication,
  }));
  return (
    <div className="space-y-3 rounded-lg border border-border p-4" aria-label="Send review">
      <p className="text-sm">
        Send the included, saved comment text to the merge request. This locks further curation for
        this snapshot.
      </p>
      <Button
        disabled={block !== null || mutation.isPending || published}
        onClick={() => {
          if (block !== null || mutation.isPending || published) return;
          const input = attempt ?? {
            revision: snapshot.review.revision,
            curationVersion: snapshot.review.curation.version,
          };
          setAttempt(input);
          mutation.mutate(input);
        }}
      >
        {mutation.isPending
          ? 'Sending…'
          : published
            ? 'Review sent'
            : retry
              ? 'Retry Send review'
              : 'Send review'}
      </Button>
      {block && <p className="text-xs text-muted-foreground">{block}</p>}
      {changed && (
        <Button
          variant="outline"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            setAttempt(null);
            mutation.reset();
          }}
        >
          Use the currently displayed saved snapshot
        </Button>
      )}
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          Send outcome is uncertain: {mutation.error.message} Some comments may already have been
          published. Refresh receipts before retrying the same snapshot; the coordinator reconciles
          prior effects.
        </p>
      )}
      {(mutation.data || snapshot.review.publication.state !== 'unpublished') && (
        <output className="block text-sm">
          {published
            ? 'All included comments were published.'
            : 'Some comments remain unpublished or need reconciliation. Retry the same saved snapshot after inspecting the receipts.'}
        </output>
      )}
      {retry && (
        <ul className="space-y-1 text-xs">
          {receipts.map((receipt) => (
            <li key={receipt.id} className="break-words">
              {receipt.id} · {receipt.state}
              {receipt.discussionId && ` · discussion ${receipt.discussionId}`}
              {receipt.error && ` · ${receipt.error}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
