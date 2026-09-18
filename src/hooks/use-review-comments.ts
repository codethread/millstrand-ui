import {
  useIsMutating,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { AgentReply } from '../../shared/api';
import type { ReviewComments } from '../../shared/review-comments';
import { agentReplyQueryOptions } from '../lib/api/agents';
import {
  curateReviewMutationOptions,
  reviewCommentsQueryOptions,
  reviewPublishMutationOptions,
} from '../lib/api/review-comments';
import { useAgentStatus, useTargetAgentRunIds } from './use-agents';
import { useWorkspace } from './use-workspace';

export type ReviewCommentsRead =
  | { kind: 'loading' }
  | { kind: 'failed'; error: Error; retry: () => void }
  | {
      kind: 'ready';
      snapshot: ReviewComments;
      refreshing: boolean;
      readError: Error | null;
      retry: () => void;
    };

export type ReviewProposalsRead =
  | { kind: 'loading'; replies: AgentReply[] }
  | { kind: 'ready'; replies: AgentReply[] }
  | { kind: 'partial'; replies: AgentReply[]; error: Error }
  | { kind: 'failed'; replies: []; error: Error };

function combineProposalQueries(
  results: { data: AgentReply | undefined; error: Error | null; isPending: boolean }[],
) {
  return {
    replies: results.flatMap((query) => (query.data ? [query.data] : [])),
    error: results.find((query) => query.error)?.error ?? null,
    loading: results.some((query) => query.isPending),
  };
}

export function useReviewCommentsRead(id: string): ReviewCommentsRead {
  const query = useQuery(reviewCommentsQueryOptions(useWorkspace(), id));
  const retry = () => {
    void query.refetch();
  };
  if (query.data)
    return {
      kind: 'ready',
      snapshot: query.data,
      refreshing: query.isFetching,
      readError: query.error,
      retry,
    };
  if (query.error) return { kind: 'failed', error: query.error, retry };
  return { kind: 'loading' };
}

export function useReviewProposals(reviewId: string): ReviewProposalsRead {
  const workspace = useWorkspace();
  const runs = useTargetAgentRunIds(reviewId);
  const agentHealth = useAgentStatus();
  const ids = runs.data ?? [];
  const results = useQueries({
    queries: ids.map((id) => agentReplyQueryOptions(workspace, id)),
    combine: combineProposalQueries,
  });
  const { replies } = results;
  const error = agentHealth.error ?? results.error;
  if (error)
    return replies.length === 0
      ? { kind: 'failed', replies: [], error }
      : { kind: 'partial', replies, error };
  if (runs.data === undefined || results.loading) return { kind: 'loading', replies };
  return { kind: 'ready', replies };
}

export function useCurateReview(id: string) {
  const workspace = useWorkspace();
  return useMutation(curateReviewMutationOptions(useQueryClient(), workspace, id));
}

export function usePublishReview(id: string) {
  const workspace = useWorkspace();
  return useMutation(reviewPublishMutationOptions(useQueryClient(), workspace, id));
}

export function useReviewMutationPending(id: string, kind: 'curate' | 'publish'): boolean {
  const workspace = useWorkspace();
  return useIsMutating({ mutationKey: [`review-${kind}`, workspace, id] }) > 0;
}
