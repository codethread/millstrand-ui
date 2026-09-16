import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  agentOptionsQueryOptions,
  agentPromptMutationOptions,
  agentQueryOptions,
  agentReplyQueryOptions,
} from '../lib/api/agents';
import { useWorkspace } from './use-workspace';

export function useAgents() {
  return useQuery(agentQueryOptions(useWorkspace()));
}

export function useAgentOptions(workspace: string | null, enabled = true) {
  return useQuery(agentOptionsQueryOptions(workspace, enabled));
}

export function useAgentReply(id: string, enabled: boolean) {
  return useQuery(agentReplyQueryOptions(useWorkspace(), id, enabled));
}

export function usePromptAgent(cardId: string) {
  const workspace = useWorkspace();
  return useMutation(agentPromptMutationOptions(useQueryClient(), workspace, cardId));
}
