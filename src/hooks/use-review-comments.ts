import {
  useIsMutating,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { agentQueryOptions, agentReplyQueryOptions } from '../lib/api/agents';
import {
  curateReviewMutationOptions,
  reviewCommentsQueryOptions,
  reviewPublishMutationOptions,
} from '../lib/api/review-comments';
import { useWorkspace } from './use-workspace';

export function useReviewComments(id: string) {
  return useQuery(reviewCommentsQueryOptions(useWorkspace(), id));
}

export function useReviewProposals(reviewId: string) {
  const workspace = useWorkspace();
  const agents = useQuery(agentQueryOptions(workspace));
  const ids = [
    ...new Set(
      agents.data?.identities.flatMap((agent) =>
        agent.runs.filter((run) => run.target === reviewId).map((run) => run.id),
      ) ?? [],
    ),
  ];
  const replies = useQueries({
    queries: ids.map((id) => agentReplyQueryOptions(workspace, id)),
  });
  return {
    replies: replies.flatMap((query) => (query.data ? [query.data] : [])),
    error: agents.error ?? replies.find((query) => query.error)?.error ?? null,
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
