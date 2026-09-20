import { mutationOptions, queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import type { WeaverOperation, WorkspaceOption } from '../../../shared/api';
import { request } from './transport';

/** Global discovery is the only query not scoped to one workspace. */
export function workspaceQueryOptions() {
  return queryOptions({
    queryKey: ['workspaces'],
    queryFn: () => request<WorkspaceOption[]>('/workspaces?refresh', null),
    refetchInterval: 30000,
  });
}

/** Cache subscription only. Dashboard owns discovery, including when menus are closed. */
export function workspaceReaderOptions() {
  return { ...workspaceQueryOptions(), enabled: false, refetchInterval: false as const };
}

export function useWorkspaces() {
  return useQuery(workspaceReaderOptions());
}

export function weaverMutationOptions(client: QueryClient, workspace: string) {
  return mutationOptions({
    mutationKey: ['weaver-lifecycle', workspace],
    mutationFn: (operation: WeaverOperation) =>
      request<{ ok: true }>(`/workspaces/${encodeURIComponent(workspace)}/lifecycle`, null, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation }),
      }),
    onSettled: async () => {
      await client.invalidateQueries({
        predicate: ({ queryKey }) => queryKey[0] === 'workspaces' || queryKey[1] === workspace,
      });
    },
    retry: false,
  });
}
