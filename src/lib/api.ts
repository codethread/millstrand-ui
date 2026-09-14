import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useAgentPromptStore } from '../agent-prompt-store';
import { useSearch } from '@tanstack/react-router';
import type {
  AgentDirectory,
  AgentOption,
  AgentPrompt,
  AgentReply,
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
    queryFn: () => request<WorkspaceOption[]>('/workspaces?refresh', null),
    refetchInterval: 30000,
  });
}
export function boardQueryOptions(workspace: string | null) {
  return queryOptions({
    queryKey: ['board', workspace],
    queryFn: () => request<Board>('/board', workspace),
    refetchInterval: 5000,
  });
}
export function agentQueryOptions(workspace: string | null) {
  return queryOptions({
    queryKey: ['agents', workspace],
    queryFn: () => request<AgentDirectory>('/agents', workspace),
    refetchInterval: 5000,
  });
}
export function useBoard() {
  return useQuery(boardQueryOptions(useWorkspace()));
}
export function useAgents() {
  return useQuery(agentQueryOptions(useWorkspace()));
}
export function useAgentOptions(workspace: string | null, enabled = true) {
  return useQuery({
    queryKey: ['agent-options', workspace],
    queryFn: () => request<AgentOption[]>('/agent-options', workspace),
    enabled,
    staleTime: 30000,
    retry: false,
  });
}
export function useAgentReply(id: string, enabled: boolean) {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['agent-reply', workspace, id],
    queryFn: () => request<AgentReply>(`/agent-runs/${encodeURIComponent(id)}`, workspace),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}
export function usePromptAgent(cardId: string) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  return useMutation(agentPromptMutationOptions(client, workspace, cardId));
}
export function agentPromptMutationOptions(
  client: QueryClient,
  workspace: string | null,
  cardId: string,
) {
  return mutationOptions({
    mutationFn: (input: AgentPrompt) =>
      request<AgentReply>(`/cards/${encodeURIComponent(cardId)}/agent-runs`, workspace, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: (reply, input) => {
      if (workspace) useAgentPromptStore.getState().track(workspace, reply.id, input.requestId);
      client.setQueryData(['agent-reply', workspace, reply.id], reply);
      void client.invalidateQueries({ queryKey: ['agents', workspace] });
    },
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
