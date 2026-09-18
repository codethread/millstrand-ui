import { useEffect } from 'react';
import { useAgentPromptStore } from '../agent-prompt-store';
import { useAgentReply } from '../hooks/use-agents';
import { useBoard } from '../hooks/use-cards';
import { runIsFinished } from '../lib/agent-notifications';
import { useDashboardActions, useWorkspaceId } from '../lib/navigation';
import { reviewDraftKey, useReviewCommentStore } from '../review-comment-store';
import { Loading } from './issue-parts';
import { Markdown } from './markdown';
import { Button } from './ui/button';

export function AgentRunReply({ id }: { id: string }) {
  const query = useAgentReply(id, true);
  const board = useBoard();
  const workspace = useWorkspaceId();
  const { exploreGraph, openCard, openReview } = useDashboardActions();
  const markRead = useAgentPromptStore((state) => state.markRead);
  const reply = query.data;
  useEffect(() => {
    if (workspace && reply && runIsFinished(reply) && !query.error) markRead(workspace, id);
  }, [workspace, id, reply, query.error, markRead]);
  const targetId = reply?.prompt?.cardId ?? reply?.target ?? null;
  const card = board.data?.cards.find((candidate) => candidate.id === targetId);
  return (
    <section className="mb-5 space-y-3" aria-label="Prompt and agent reply">
      {reply?.prompt && reply.prompt.kind !== 'card' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (workspace && reply.prompt?.kind === 'review-comment')
              useReviewCommentStore
                .getState()
                .focusDraft(
                  reviewDraftKey(
                    workspace,
                    reply.prompt.cardId,
                    reply.prompt.comment.revision,
                    reply.prompt.comment.id,
                  ),
                );
            openReview(reply.prompt?.cardId ?? '');
          }}
        >
          {reply.prompt.kind === 'review-comment' ? 'View comment' : 'View review'} ·{' '}
          {reply.prompt.kind === 'review-comment' ? reply.prompt.comment.id : reply.prompt.cardId}
        </Button>
      ) : (
        card && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (reply?.target !== card.id) exploreGraph(card.id);
              else openCard(card.id);
            }}
          >
            View work · {card.id}
          </Button>
        )
      )}
      {reply?.prompt && (
        <div className="rounded-lg bg-accent p-3">
          <h4 className="mb-2 text-xs font-semibold">Your prompt</h4>
          <p className="whitespace-pre-wrap break-words text-sm">{reply.prompt.text}</p>
          {reply.prompt.kind !== 'card' && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer">Review context sent to agent</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">{reply.prompt.context}</pre>
            </details>
          )}
        </div>
      )}
      {query.error && (
        <div role="alert" className="text-xs text-destructive">
          Reply unavailable: {query.error.message}
          {reply && ' Showing the last successful reply.'}{' '}
          <button
            className="underline"
            onClick={() => {
              void query.refetch();
            }}
          >
            Retry reply
          </button>
        </div>
      )}
      {!reply ? (
        !query.error && <Loading text="Loading reply…" />
      ) : (
        <>
          {reply.error && (
            <p role="alert" className="break-words text-xs text-destructive">
              {reply.error}
            </p>
          )}
          {reply.result !== null ? (
            <div className="rounded-lg border border-border p-3">
              <h4 className="mb-2 text-xs font-semibold">Agent reply</h4>
              <Markdown text={reply.result} />
            </div>
          ) : (
            <output className="block text-xs text-muted-foreground">
              {reply.status === 'ready'
                ? 'Queued · waiting for the agent to start.'
                : reply.status === 'running'
                  ? 'Working on your prompt. The reply will appear here.'
                  : reply.status === 'unknown'
                    ? 'Run state is unavailable. Waiting for an update.'
                    : 'This run ended without a reply.'}
            </output>
          )}
        </>
      )}
    </section>
  );
}
