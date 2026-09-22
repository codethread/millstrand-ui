import { useEffect, useMemo, useRef } from 'react';
import {
  useReviewCommentsRead,
  useCurateReview,
  useReviewProposals,
  useReviewMutationPending,
} from '../hooks/use-review-comments';
import { useWorkspaceId } from '../lib/navigation';
import {
  reviewDraftKey,
  useReviewCommentDraft,
  useReviewCommentDraftError,
  useReviewCommentFocus,
  useReviewCommentStore,
} from '../review-comment-store';
import {
  reviewCommentCandidateConflict,
  reviewCommentModels,
  type ReviewCommentModel,
} from '../lib/review-comments';
import { ReviewCommentCard } from './review-comment-card';
import { ReviewCommentProposal } from './review-comment-proposal';
import { ReviewPublication } from './review-publication';
import { Markdown } from './markdown';
import { Button } from './ui/button';

function ReviewCommentController({ model }: { model: ReviewCommentModel }) {
  const { comment, curation, proposals } = model;
  const workspace = useWorkspaceId();
  const mutation = useCurateReview(curation.reviewId);
  const publishing = useReviewMutationPending(curation.reviewId, 'publish');
  const loadDraft = useReviewCommentStore((state) => state.load);
  const retryDraft = useReviewCommentStore((state) => state.retry);
  const openDraft = useReviewCommentStore((state) => state.open);
  const editDraft = useReviewCommentStore((state) => state.edit);
  const discardDraft = useReviewCommentStore((state) => state.discard);
  const rebaseDraft = useReviewCommentStore((state) => state.rebase);
  const acknowledgeAdoption = useReviewCommentStore((state) => state.adopted);
  const focusDraft = useReviewCommentStore((state) => state.focusDraft);
  const element = useRef<HTMLDivElement>(null);
  const key = reviewDraftKey(workspace ?? '', curation.reviewId, curation.revision, comment.id);
  const focused = useReviewCommentFocus(key);
  const saved = useReviewCommentDraft(key);
  const storageError = useReviewCommentDraftError(key);
  const draft = saved?.state.kind === 'editing' ? saved.state.draft : null;
  const mutable = !publishing && curation.mutable;
  const candidateConflict =
    draft !== null &&
    reviewCommentCandidateConflict(saved?.candidateVersion ?? null, comment.candidate.version);

  useEffect(() => {
    if (focused) {
      element.current?.scrollIntoView({ block: 'center' });
      element.current?.focus({ preventScroll: true });
      focusDraft(null);
    }
  }, [focusDraft, focused]);
  useEffect(() => {
    loadDraft(key);
  }, [key, loadDraft]);

  function choose(inclusion: 'included' | 'dismissed') {
    mutation.mutate({
      revision: curation.revision,
      expectedVersion: curation.curationVersion,
      by: 'millstrand-ui',
      changes: [{ id: comment.id, inclusion }],
    });
  }

  return (
    <div ref={element} tabIndex={-1} id={`comment-${comment.id}`} className="space-y-2">
      <h4 className="break-words text-sm font-semibold">{comment.title}</h4>
      <p className="text-xs text-muted-foreground">
        {[
          comment.severity,
          comment.category,
          `Candidate ${comment.candidate.version}`,
          comment.publication.state,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <ReviewCommentCard
        body={comment.candidate.text}
        positionLabel={model.positionLabel}
        inclusion={comment.inclusion}
        validationText={!mutable ? 'Curation is locked.' : model.positionValidation}
        errorText={mutation.error?.message ?? comment.publication.error}
        busy={mutation.isPending}
        disabled={!mutable || workspace === null}
        onInclude={() => choose('included')}
        onDismiss={() => choose('dismissed')}
        proposalEditor={
          <>
            {storageError && (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-destructive">
                  {storageError.message}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => retryDraft(key)}>
                    Retry draft storage
                  </Button>
                  {storageError.kind === 'read' && (
                    <Button size="sm" variant="outline" onClick={() => discardDraft(key)}>
                      Discard unread saved draft
                    </Button>
                  )}
                </div>
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-xs">Original reviewer text</summary>
              <Markdown text={comment.candidate.original.text} />
            </details>
            {candidateConflict && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Compare the canonical text above with your draft before using the current
                  candidate as its new baseline.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!mutable || mutation.isPending}
                  onClick={() => {
                    rebaseDraft(key, comment.candidate.version);
                    mutation.reset();
                  }}
                >
                  Keep draft against candidate {comment.candidate.version}
                </Button>
              </div>
            )}
            {draft === null ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!mutable || storageError?.kind === 'read'}
                onClick={() => openDraft(key, comment.candidate.text, comment.candidate.version)}
              >
                Edit revised text
              </Button>
            ) : (
              <ReviewCommentProposal
                text={draft.text}
                busy={mutation.isPending}
                adoptDisabled={
                  !mutable ||
                  candidateConflict ||
                  saved?.candidateVersion !== comment.candidate.version ||
                  draft.text === comment.candidate.text
                }
                errorText={
                  candidateConflict
                    ? 'The canonical candidate changed. Compare it above, then explicitly keep the draft against the new candidate or cancel.'
                    : (mutation.error?.message ?? null)
                }
                onEdit={(text) => editDraft(key, text)}
                onCancel={() => discardDraft(key)}
                onAdopt={() => {
                  if (
                    !saved ||
                    !mutable ||
                    saved.candidateVersion !== comment.candidate.version ||
                    draft.text === comment.candidate.text
                  )
                    return;
                  mutation.mutate(
                    {
                      revision: curation.revision,
                      expectedVersion: curation.curationVersion,
                      by: 'millstrand-ui',
                      changes: [
                        {
                          id: comment.id,
                          inclusion: comment.inclusion,
                          candidate: {
                            expectedVersion: saved.candidateVersion,
                            text: draft.text,
                          },
                        },
                      ],
                    },
                    { onSuccess: () => acknowledgeAdoption(key, draft) },
                  );
                }}
              />
            )}
            {proposals.map(({ reply, candidateVersion }) => (
              <details key={reply.id} className="border-t border-border pt-2">
                <summary className="cursor-pointer text-xs">
                  Agent proposal · {reply.id} · {reply.status}
                </summary>
                <p className="my-2 text-xs text-muted-foreground">
                  Requested against candidate {candidateVersion}. Proposals do not change included
                  text.
                </p>
                {reply.result !== null && (
                  <>
                    <Markdown text={reply.result} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !mutable ||
                        draft !== null ||
                        reply.status === 'ready' ||
                        reply.status === 'running'
                      }
                      onClick={() => openDraft(key, reply.result ?? '', comment.candidate.version)}
                    >
                      Inspect and edit proposal
                    </Button>
                  </>
                )}
                {reply.error && (
                  <p role="alert" className="text-xs text-destructive">
                    {reply.error}
                  </p>
                )}
              </details>
            ))}
          </>
        }
      />
    </div>
  );
}

export function ReviewComments({ id }: { id: string }) {
  const commentsRead = useReviewCommentsRead(id);
  const proposalsRead = useReviewProposals(id);
  const snapshot = commentsRead.kind === 'ready' ? commentsRead.snapshot : null;
  const models = useMemo(
    () => (snapshot ? reviewCommentModels(snapshot, proposalsRead.replies) : []),
    [snapshot, proposalsRead.replies],
  );
  const commentsError =
    commentsRead.kind === 'failed'
      ? commentsRead.error
      : commentsRead.kind === 'ready'
        ? commentsRead.readError
        : null;
  const retryComments =
    commentsRead.kind === 'failed' || commentsRead.kind === 'ready' ? commentsRead.retry : null;
  const proposalsError =
    proposalsRead.kind === 'partial' || proposalsRead.kind === 'failed'
      ? proposalsRead.error
      : null;

  return (
    <section aria-label="Review comments" className="space-y-4 border-t border-border p-5 md:p-7">
      <h3 className="text-sm font-semibold">Review comments</h3>
      {snapshot && commentsRead.kind === 'ready' && (
        <ReviewPublication
          key={`${id}:${snapshot.review.revision}`}
          snapshot={snapshot}
          refreshing={commentsRead.refreshing}
          readError={commentsRead.readError !== null}
        />
      )}
      {commentsError && (
        <p role="alert" className="text-sm text-destructive">
          Comments unavailable: {commentsError.message}{' '}
          {retryComments && (
            <Button variant="ghost" size="sm" onClick={retryComments}>
              Retry
            </Button>
          )}
        </p>
      )}
      {proposalsError && (
        <p role="alert" className="text-xs text-destructive">
          Agent proposals could not refresh: {proposalsError.message}
          {proposalsRead.kind === 'partial' && ' Showing the proposals that remain available.'}
        </p>
      )}
      {commentsRead.kind === 'loading' && (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      )}
      {proposalsRead.kind === 'loading' && (
        <p className="text-xs text-muted-foreground">Loading agent proposals…</p>
      )}
      {snapshot?.comments.length === 0 && (
        <p className="text-sm text-muted-foreground">No structured comments in this review.</p>
      )}
      {models.map((model) => (
        <ReviewCommentController key={model.comment.id} model={model} />
      ))}
    </section>
  );
}
