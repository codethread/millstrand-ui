import { useEffect, useRef } from 'react';
import type { AgentReply } from '../../shared/api';
import type { ReviewComment, ReviewComments as Snapshot } from '../../shared/review-comments';
import {
  useReviewComments,
  useCurateReview,
  useReviewProposals,
  useReviewMutationPending,
} from '../hooks/use-review-comments';
import { useWorkspaceId } from '../lib/navigation';
import { useAgentPromptStore } from '../agent-prompt-store';
import { reviewDraftKey, useReviewCommentStore } from '../review-comment-store';
import {
  reviewCommentPositionLabel,
  reviewCommentPositionValidation,
} from '../lib/review-comments';
import { ReviewCommentCard } from './review-comment-card';
import { ReviewCommentProposal } from './review-comment-proposal';
import { ReviewPublication } from './review-publication';
import { Markdown } from './markdown';
import { Button } from './ui/button';

function Comment({
  snapshot,
  comment,
  replies,
}: {
  snapshot: Snapshot;
  comment: ReviewComment;
  replies: AgentReply[];
}) {
  const workspace = useWorkspaceId();
  const mutation = useCurateReview(snapshot.review.id);
  const publishing = useReviewMutationPending(snapshot.review.id, 'publish');
  const store = useReviewCommentStore();
  const { focus, focusComment, load } = store;
  const openPrompt = useAgentPromptStore((s) => s.open);
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus?.reviewId === snapshot.review.id && focus.commentId === comment.id) {
      element.current?.scrollIntoView({ block: 'center' });
      element.current?.focus({ preventScroll: true });
      focusComment(null);
    }
  }, [focus, focusComment, snapshot.review.id, comment.id]);
  const key = reviewDraftKey(
    workspace ?? '',
    snapshot.review.id,
    snapshot.review.revision,
    comment.id,
  );
  useEffect(() => {
    load(key);
  }, [key, load]);
  const saved = store.drafts[key];
  const draft = saved?.state.kind === 'editing' ? saved.state.draft : null;
  const mutable = !publishing && snapshot.review.current && snapshot.review.curation.mutable;
  const proposals = replies.filter(
    (reply) =>
      reply.prompt?.kind === 'review-comment' &&
      reply.prompt.comment.id === comment.id &&
      reply.prompt.comment.revision === snapshot.review.revision,
  );
  function choose(inclusion: 'included' | 'dismissed') {
    mutation.mutate({
      revision: snapshot.review.revision,
      expectedVersion: snapshot.review.curation.version,
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
        positionLabel={reviewCommentPositionLabel(comment.position)}
        inclusion={comment.inclusion}
        validationText={
          !mutable ? 'Curation is locked.' : reviewCommentPositionValidation(comment.position)
        }
        errorText={mutation.error?.message ?? comment.publication.error}
        busy={mutation.isPending}
        disabled={!mutable || workspace === null}
        onInclude={() => choose('included')}
        onDismiss={() => choose('dismissed')}
        onPromptAgent={() => {
          if (workspace)
            openPrompt(
              {
                kind: 'review-comment',
                cardId: snapshot.review.id,
                id: snapshot.review.id,
                title: comment.title,
                comment: {
                  id: comment.id,
                  revision: snapshot.review.revision,
                  candidateVersion: comment.candidate.version,
                },
              },
              null,
              workspace,
            );
        }}
        proposalEditor={
          <>
            {store.errors[key] && (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-destructive">
                  {store.errors[key].message}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => store.retry(key)}>
                    Retry draft storage
                  </Button>
                  {store.errors[key].kind === 'read' && (
                    <Button size="sm" variant="outline" onClick={() => store.discard(key)}>
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
            {draft !== null && saved?.candidateVersion !== comment.candidate.version && (
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
                    store.rebase(key, comment.candidate.version);
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
                disabled={!mutable || store.errors[key]?.kind === 'read'}
                onClick={() => store.open(key, comment.candidate.text, comment.candidate.version)}
              >
                Edit revised text
              </Button>
            ) : (
              <ReviewCommentProposal
                text={draft.text}
                busy={mutation.isPending}
                adoptDisabled={
                  !mutable ||
                  saved?.candidateVersion !== comment.candidate.version ||
                  draft.text === comment.candidate.text
                }
                errorText={
                  saved?.candidateVersion !== comment.candidate.version
                    ? 'The canonical candidate changed. Compare it above, then explicitly keep the draft against the new candidate or cancel.'
                    : (mutation.error?.message ?? null)
                }
                onEdit={(text) => store.edit(key, text)}
                onCancel={() => store.discard(key)}
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
                      revision: snapshot.review.revision,
                      expectedVersion: snapshot.review.curation.version,
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
                    { onSuccess: () => store.adopted(key, draft) },
                  );
                }}
              />
            )}
            {proposals.map((reply) => (
              <details key={reply.id} className="border-t border-border pt-2">
                <summary className="cursor-pointer text-xs">
                  Agent proposal · {reply.id} · {reply.status}
                </summary>
                {reply.prompt?.kind === 'review-comment' && (
                  <p className="my-2 text-xs text-muted-foreground">
                    Requested against candidate {reply.prompt.comment.candidateVersion}. Proposals
                    do not change included text.
                  </p>
                )}
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
                      onClick={() => store.open(key, reply.result ?? '', comment.candidate.version)}
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
  const query = useReviewComments(id);
  const proposals = useReviewProposals(id);
  return (
    <section aria-label="Review comments" className="space-y-4 border-t border-border p-5 md:p-7">
      <h3 className="text-sm font-semibold">Review comments</h3>
      {query.data && (
        <ReviewPublication
          key={`${id}:${query.data.review.revision}`}
          snapshot={query.data}
          refreshing={query.isFetching}
          readError={query.error !== null}
        />
      )}
      {query.error && (
        <p role="alert" className="text-sm text-destructive">
          Comments unavailable: {query.error.message}{' '}
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </p>
      )}
      {proposals.error && (
        <p role="alert" className="text-xs text-destructive">
          Agent proposals could not refresh: {proposals.error.message}
        </p>
      )}
      {!query.data && !query.error && (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      )}
      {query.data?.comments.length === 0 && (
        <p className="text-sm text-muted-foreground">No structured comments in this review.</p>
      )}
      {query.data?.comments.map((comment) => (
        <Comment
          key={comment.id}
          snapshot={query.data}
          comment={comment}
          replies={proposals.replies}
        />
      ))}
    </section>
  );
}
