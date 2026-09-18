import {
  useIsMutating,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { agentReplyQueryOptions } from '../lib/api/agents';
import {
  curateReviewMutationOptions,
  reviewCommentsQueryOptions,
  reviewPublishMutationOptions,
} from '../lib/api/review-comments';
import { useAgentStatus, useTargetAgentRunIds } from './use-agents';
import { useWorkspace } from './use-workspace';

export function useReviewComments(id: string) {
  return useQuery(reviewCommentsQueryOptions(useWorkspace(), id));
}

export function useReviewProposals(reviewId: string) {
  const workspace = useWorkspace();
  const runs = useTargetAgentRunIds(reviewId);
  const agentHealth = useAgentStatus();
  const ids = runs.data ?? [];
  const replies = useQueries({
    queries: ids.map((id) => agentReplyQueryOptions(workspace, id)),
  });
  return {
    replies: replies.flatMap((query) => (query.data ? [query.data] : [])),
    error: agentHealth.error ?? replies.find((query) => query.error)?.error ?? null,
  };
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
