import { mutationOptions, queryOptions, type QueryClient } from '@tanstack/react-query';
import type { SavedView } from '../../../shared/api';
import { request } from './transport';

export function viewsQueryOptions(workspace: string | null) {
  return queryOptions({
    queryKey: ['views', workspace],
    queryFn: () => request<SavedView[]>('/views', workspace),
    refetchInterval: 15000,
  });
}

export function saveViewsMutationOptions(client: QueryClient, workspace: string | null) {
  return mutationOptions({
    mutationFn: (views: SavedView[]) =>
      request<SavedView[]>('/views', workspace, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(views),
      }),
    onSuccess: (views) => {
      client.setQueryData(['views', workspace], views);
    },
  });
}
