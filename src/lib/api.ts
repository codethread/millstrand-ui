import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import type {
  AgentDirectory,
  Board,
  CardDetail,
  CardGraph,
  LabelChange,
  Note,
  SavedView,
  WorkspaceOption,
} from '../../shared/api';

async function request<T>(path: string, workspace: string | null, init?: RequestInit): Promise<T> {
  const query = workspace ? `?workspace=${encodeURIComponent(workspace)}` : '';
  const response = await fetch(`/api${path}${query}`, init);
  if (!response.ok) {
    const body: unknown = await response.json();
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function useWorkspace() {
  return useSearch({ from: '/', select: (search) => search.workspace });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => request<WorkspaceOption[]>('/workspaces', null),
    refetchInterval: 30000,
  });
}
export function useBoard() {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['board', workspace],
    queryFn: () => request<Board>('/board', workspace),
    refetchInterval: 5000,
  });
}
export function useAgents() {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['agents', workspace],
    queryFn: () => request<AgentDirectory>('/agents', workspace),
    refetchInterval: 5000,
  });
}
export function useViews() {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['views', workspace],
    queryFn: () => request<SavedView[]>('/views', workspace),
    refetchInterval: 15000,
  });
}
export function useCard(id: string) {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['card', workspace, id],
    queryFn: () => request<CardDetail>(`/cards/${encodeURIComponent(id)}`, workspace),
    refetchInterval: 5000,
  });
}
export function useGraph(id: string | null) {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['graph', workspace, id],
    queryFn: () => request<CardGraph>(`/cards/${encodeURIComponent(id ?? '')}/graph`, workspace),
    enabled: id !== null,
    refetchInterval: 10000,
  });
}
export function useTaskNotes(cardId: string, taskId: string, enabled: boolean) {
  const workspace = useWorkspace();
  return useQuery({
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
export function useSaveViews() {
  const workspace = useWorkspace();
  const client = useQueryClient();
  return useMutation({
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
export function useLabels(id: string) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  return useMutation({
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
