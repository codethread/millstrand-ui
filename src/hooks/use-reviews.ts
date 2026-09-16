import { useQuery } from '@tanstack/react-query';
import { reviewQueryOptions, reviewsQueryOptions } from '../lib/api/reviews';
import { useWorkspace } from './use-workspace';

export function useReviews() {
  return useQuery(reviewsQueryOptions(useWorkspace()));
}

export function useReview(id: string) {
  return useQuery(reviewQueryOptions(useWorkspace(), id));
}
