import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveViewsMutationOptions, viewsQueryOptions } from '../lib/api/views';
import { useWorkspace } from './use-workspace';

const selectViewsSnapshot = () => true;

export function useViewsPoll() {
  return useQuery(viewsQueryOptions(useWorkspace()));
}

export function useSavedViews() {
  return useQuery({
    ...viewsQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
  });
}

export function useViewsSnapshot() {
  return useQuery({
    ...viewsQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectViewsSnapshot,
  });
}

export function useSaveViews() {
  const workspace = useWorkspace();
  return useMutation(saveViewsMutationOptions(useQueryClient(), workspace));
}
