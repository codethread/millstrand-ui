import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  boardQueryOptions,
  cardActionMutationOptions,
  cardQueryOptions,
  graphQueryOptions,
  labelsMutationOptions,
  taskNotesQueryOptions,
} from '../lib/api/cards';
import { useWorkspace } from './use-workspace';

export function useBoard() {
  return useQuery(boardQueryOptions(useWorkspace()));
}

export function useCard(id: string) {
  return useQuery(cardQueryOptions(useWorkspace(), id));
}

export function useGraph(id: string | null) {
  return useQuery(graphQueryOptions(useWorkspace(), id));
}

export function useTaskNotes(cardId: string, taskId: string, enabled: boolean) {
  return useQuery(taskNotesQueryOptions(useWorkspace(), cardId, taskId, enabled));
}

export function useLabels(id: string) {
  const workspace = useWorkspace();
  return useMutation(labelsMutationOptions(useQueryClient(), workspace, id));
}

export function useCardAction() {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/' });
  return useMutation({
    ...cardActionMutationOptions(useQueryClient(), workspace),
    onSuccess: (_result, { id, action }) => {
      if (action.kind === 'delete')
        void navigate({
          from: '/',
          to: '/',
          search: (old) =>
            'workspace' in old && old.workspace === workspace
              ? {
                  ...old,
                  issue: old.issue === id ? null : old.issue,
                  graphRoot: old.graphRoot === id ? null : old.graphRoot,
                }
              : old,
          replace: true,
        });
    },
  });
}

export function useCardActionFeedback() {
  const workspace = useWorkspace();
  const states = useMutationState({
    filters: { mutationKey: ['card-action', workspace] },
    select: (mutation) => ({ status: mutation.state.status, error: mutation.state.error }),
  });
  return states.at(-1) ?? null;
}

export function useCardActionPending() {
  return useIsMutating({ mutationKey: ['card-action', useWorkspace()] }) > 0;
}
