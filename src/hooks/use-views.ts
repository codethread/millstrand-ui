import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveViewsMutationOptions, viewsQueryOptions } from '../lib/api/views';
import { useWorkspace } from './use-workspace';

export function useViews() {
  return useQuery(viewsQueryOptions(useWorkspace()));
}

export function useSaveViews() {
  const workspace = useWorkspace();
  return useMutation(saveViewsMutationOptions(useQueryClient(), workspace));
}
