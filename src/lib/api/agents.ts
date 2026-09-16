import { mutationOptions, queryOptions, type QueryClient } from '@tanstack/react-query';
import type { AgentDirectory, AgentOption, AgentPrompt, AgentReply } from '../../../shared/api';
import { useAgentPromptStore } from '../../agent-prompt-store';
import { request } from './transport';

export function agentQueryOptions(workspace: string | null) {
  return queryOptions({
    queryKey: ['agents', workspace],
    queryFn: () => request<AgentDirectory>('/agents', workspace),
    refetchInterval: 5000,
  });
}

export function agentOptionsQueryOptions(workspace: string | null, enabled = true) {
  return queryOptions({
    queryKey: ['agent-options', workspace],
    queryFn: () => request<AgentOption[]>('/agent-options', workspace),
    enabled,
    staleTime: 30000,
    retry: false,
  });
}

export function agentReplyQueryOptions(workspace: string | null, id: string, enabled = true) {
  return queryOptions({
    queryKey: ['agent-reply', workspace, id],
    queryFn: () => request<AgentReply>(`/agent-runs/${encodeURIComponent(id)}`, workspace),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
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
