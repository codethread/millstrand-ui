import { useQuery } from '@tanstack/react-query';
import type { ReviewDetail, ReviewDirectory } from '../../shared/reviews';
import { reviewQueryOptions, reviewsQueryOptions } from '../lib/api/reviews';
import { reviewDirectoryContent, reviewInboxCount } from '../lib/reviews';
import { useWorkspace } from './use-workspace';

const selectReviewsFetchedAt = (directory: ReviewDirectory) =>
  directory.kind === 'available' ? directory.fetchedAt : null;
const selectReviewDirectory = (directory: ReviewDirectory) => reviewDirectoryContent(directory);
const selectReviewInboxCount = (directory: ReviewDirectory) => reviewInboxCount(directory);
const selectReviewDetail = (detail: ReviewDetail) => detail;
const selectReviewDetailSnapshot = () => true;

export function useReviewsPoll() {
  return useQuery(reviewsQueryOptions(useWorkspace()));
}

/** Directory content reader. Fetch timing and health stay with the poll/status hooks. */
export function useReviewDirectory() {
  return useQuery({
    ...reviewsQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectReviewDirectory,
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

/** The selected report is its own poll owner for the lifetime of the detail pane. */
export function useReviewDetailPoll(id: string) {
  return useQuery(reviewQueryOptions(useWorkspace(), id));
}

export function useReviewDetail(id: string) {
  return useQuery({
    ...reviewQueryOptions(useWorkspace(), id),
    enabled: false,
    refetchInterval: false,
    select: selectReviewDetail,
  });
}

/** Health reader uses a boolean snapshot marker instead of carrying report content. */
export function useReviewDetailStatus(id: string) {
  return useQuery({
    ...reviewQueryOptions(useWorkspace(), id),
    enabled: false,
    refetchInterval: false,
    select: selectReviewDetailSnapshot,
  });
}
