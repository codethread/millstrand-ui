import { useQuery } from '@tanstack/react-query';
import type { ReviewDirectory } from '../../shared/reviews';
import { reviewQueryOptions, reviewsQueryOptions } from '../lib/api/reviews';
import { reviewInboxCount } from '../lib/reviews';
import { useWorkspace } from './use-workspace';

const selectReviewsFetchedAt = (directory: ReviewDirectory) =>
  directory.kind === 'available' ? directory.fetchedAt : null;
const selectReviewInboxCount = (directory: ReviewDirectory) => reviewInboxCount(directory);

export function useReviewsPoll() {
  return useQuery(reviewsQueryOptions(useWorkspace()));
}

export function useReviews() {
  return useQuery({
    ...reviewsQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
  });
}

export function useReviewsStatus() {
  return useQuery({
    ...reviewsQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectReviewsFetchedAt,
  });
}

export function useReviewInboxCount() {
  return useQuery({
    ...reviewsQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectReviewInboxCount,
  });
}

export function useReview(id: string) {
  return useQuery(reviewQueryOptions(useWorkspace(), id));
}
