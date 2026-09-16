import { mutationOptions, queryOptions, type QueryClient } from '@tanstack/react-query';
import type {
  CurateReview,
  PublishReview,
  ReviewComments,
  ReviewPublicationReceipt,
} from '../../../shared/review-comments';
import { request } from './transport';

export function reviewCommentsQueryOptions(workspace: string | null, id: string) {
  return queryOptions({
    queryKey: ['review-comments', workspace, id],
    queryFn: () =>
      request<ReviewComments>(`/reviews/${encodeURIComponent(id)}/comments`, workspace),
    refetchInterval: 5000,
  });
}

export function curateReviewMutationOptions(
  client: QueryClient,
  workspace: string | null,
  id: string,
) {
  return mutationOptions({
    mutationKey: ['review-curate', workspace, id],
    mutationFn: (input: CurateReview) =>
      request<ReviewComments>(`/reviews/${encodeURIComponent(id)}/comments`, workspace, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['review-comments', workspace, id] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['review-comments', workspace, id] });
    },
  });
}

export function reviewPublishMutationOptions(
  client: QueryClient,
  workspace: string | null,
  id: string,
) {
  return mutationOptions({
    mutationKey: ['review-publish', workspace, id],
    mutationFn: (input: PublishReview) =>
      request<ReviewPublicationReceipt>(`/reviews/${encodeURIComponent(id)}/publish`, workspace, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['review-comments', workspace, id] }),
        client.invalidateQueries({ queryKey: ['review', workspace, id] }),
        client.invalidateQueries({ queryKey: ['reviews', workspace] }),
      ]);
    },
    retry: false,
  });
}
