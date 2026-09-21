import { mutationOptions, queryOptions, type QueryClient } from '@tanstack/react-query';
import type {
  Board,
  CardAction,
  CardDetail,
  CardGraph,
  LabelChange,
  Note,
} from '../../../shared/api';
import { request } from './transport';

export function boardQueryOptions(workspace: string | null) {
  return queryOptions({
    queryKey: ['board', workspace],
    queryFn: () => request<Board>('/board', workspace),
    refetchInterval: 5000,
  });
}

export function cardQueryOptions(workspace: string | null, id: string) {
  return queryOptions({
    queryKey: ['card', workspace, id],
    queryFn: () => request<CardDetail>(`/cards/${encodeURIComponent(id)}`, workspace),
    refetchInterval: 5000,
  });
}

export function graphQueryOptions(workspace: string | null, id: string | null) {
  return queryOptions({
    queryKey: ['graph', workspace, id],
    queryFn: () => request<CardGraph>(`/cards/${encodeURIComponent(id ?? '')}/graph`, workspace),
    enabled: id !== null,
    refetchInterval: 10000,
  });
}

/** GraphView owns this poll; counts include links outside the rendered graph. */
export function dependencyQueryOptions(workspace: string | null) {
  return queryOptions({
    queryKey: ['dependencies', workspace],
    queryFn: () => request<CardGraph>('/dependencies', workspace),
    refetchInterval: 10000,
  });
}

export function taskNotesQueryOptions(
  workspace: string | null,
  cardId: string,
  taskId: string,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: ['notes', workspace, taskId],
    queryFn: () =>
      request<Note[]>(
        `/cards/${encodeURIComponent(cardId)}/tasks/${encodeURIComponent(taskId)}/notes`,
        workspace,
      ),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

export function labelsMutationOptions(client: QueryClient, workspace: string | null, id: string) {
  return mutationOptions({
    mutationFn: (change: LabelChange) =>
      request<CardDetail>(`/cards/${encodeURIComponent(id)}/labels`, workspace, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      }),
    onSuccess: async (detail) => {
      client.setQueryData(['card', workspace, id], detail);
      await client.invalidateQueries({ queryKey: ['board', workspace] });
    },
  });
}

export function cardActionMutationOptions(client: QueryClient, workspace: string | null) {
  return mutationOptions({
    mutationKey: ['card-action', workspace],
    mutationFn: ({ id, action }: { id: string; action: CardAction }) =>
      request<{ ok: true }>(
        `/cards/${encodeURIComponent(id)}${action.kind === 'move' ? '/lane' : ''}`,
        workspace,
        {
          method: action.kind === 'delete' ? 'DELETE' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          ...(action.kind === 'move' ? { body: JSON.stringify({ lane: action.lane }) } : {}),
        },
      ),
    onSettled: async () => {
      await Promise.all(
        ['board', 'card', 'graph', 'dependencies', 'agents'].map((key) =>
          client.invalidateQueries({ queryKey: [key, workspace] }),
        ),
      );
    },
    retry: false,
  });
}
