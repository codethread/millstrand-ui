import { queryOptions, useQuery } from '@tanstack/react-query';
import type { WorkspaceOption } from '../../../shared/api';
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
