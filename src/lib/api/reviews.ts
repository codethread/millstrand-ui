import { queryOptions } from '@tanstack/react-query';
import type { ReviewDetail, ReviewDirectory } from '../../../shared/reviews';
import { request } from './transport';

export function reviewDirectoryPollInterval(directory: ReviewDirectory | undefined): 5000 | false {
  return directory?.kind === 'unsupported' ? false : 5000;
}

export function reviewsQueryOptions(workspace: string | null) {
  return queryOptions({
    queryKey: ['reviews', workspace],
    queryFn: () => request<ReviewDirectory>('/reviews', workspace),
    refetchInterval: (query) => reviewDirectoryPollInterval(query.state.data),
  });
}

export function reviewQueryOptions(workspace: string | null, id: string) {
  return queryOptions({
    queryKey: ['review', workspace, id],
    queryFn: () => request<ReviewDetail>(`/reviews/${encodeURIComponent(id)}`, workspace),
    refetchInterval: 5000,
  });
}
