import type { ReviewDetail, ReviewDirectory } from '../../shared/reviews';
import type {
  CurateReview,
  ReviewComments,
  PublishReview,
  ReviewPublicationReceipt,
} from '../../shared/review-comments';
import {
  mutationOptions,
  queryOptions,
  useMutation,
  useMutationState,
  useIsMutating,
  useQuery,
  useQueries,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useAgentPromptStore } from '../agent-prompt-store';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type {
  AgentDirectory,
  AgentOption,
  AgentPrompt,
  AgentReply,
  Board,
  CardDetail,
  CardGraph,
  CardAction,
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
  // Fetch exposes JSON as `any`; endpoint contracts provide the type at this boundary.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
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
        ['board', 'card', 'graph', 'agents'].map((key) =>
          client.invalidateQueries({ queryKey: [key, workspace] }),
        ),
      );
    },
    retry: false,
  });
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

export function useReviews() {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['reviews', workspace],
    queryFn: () => request<ReviewDirectory>('/reviews', workspace),
    refetchInterval: 5000,
  });
}
export function useReview(id: string) {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['review', workspace, id],
    queryFn: () => request<ReviewDetail>(`/reviews/${encodeURIComponent(id)}`, workspace),
    refetchInterval: 5000,
  });
}

export function useReviewComments(id: string) {
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['review-comments', workspace, id],
    queryFn: () =>
      request<ReviewComments>(`/reviews/${encodeURIComponent(id)}/comments`, workspace),
    refetchInterval: 5000,
  });
}

export function useReviewProposals(reviewId: string) {
  const workspace = useWorkspace();
  const agents = useAgents();
  const ids = [
    ...new Set(
      agents.data?.identities.flatMap((agent) =>
        agent.runs.filter((run) => run.target === reviewId).map((run) => run.id),
      ) ?? [],
    ),
  ];
  const replies = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['agent-reply', workspace, id],
      queryFn: () => request<AgentReply>(`/agent-runs/${encodeURIComponent(id)}`, workspace),
      refetchInterval: 5000,
    })),
  });
  return {
    replies: replies.flatMap((query) => (query.data ? [query.data] : [])),
    error: agents.error ?? replies.find((query) => query.error)?.error ?? null,
  };
}

export function useCurateReview(id: string) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['review-curate', workspace, id],
    mutationFn: (input: CurateReview) =>
      request<ReviewComments>(`/reviews/${encodeURIComponent(id)}/comments`, workspace, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['review-comments', workspace, id] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['review-comments', workspace, id] });
    },
  });
}

export function reviewPublishMutationOptions(
  client: QueryClient,
  workspace: string | null,
  id: string,
) {
  return mutationOptions({
    mutationKey: ['review-publish', workspace, id],
    mutationFn: (input: PublishReview) =>
      request<ReviewPublicationReceipt>(`/reviews/${encodeURIComponent(id)}/publish`, workspace, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['review-comments', workspace, id] }),
        client.invalidateQueries({ queryKey: ['review', workspace, id] }),
        client.invalidateQueries({ queryKey: ['reviews', workspace] }),
      ]);
    },
    retry: false,
  });
}
export function usePublishReview(id: string) {
  const workspace = useWorkspace();
  return useMutation(reviewPublishMutationOptions(useQueryClient(), workspace, id));
}

export function useReviewMutationPending(id: string, kind: 'curate' | 'publish'): boolean {
  const workspace = useWorkspace();
  return useIsMutating({ mutationKey: [`review-${kind}`, workspace, id] }) > 0;
}
