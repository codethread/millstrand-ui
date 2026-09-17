import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentDirectory } from '../../shared/api';
import {
  agentOptionsQueryOptions,
  agentPromptMutationOptions,
  agentQueryOptions,
  agentReplyQueryOptions,
} from '../lib/api/agents';
import { agentIsActive } from '../lib/agents';
import { useWorkspace } from './use-workspace';

const selectAgentWorkspace = (directory: AgentDirectory) => directory.workspace;
const selectAgentIdentities = (directory: AgentDirectory) => directory.identities;
const selectAgentFetchedAt = (directory: AgentDirectory) => directory.fetchedAt;
const selectAgentSnapshot = () => true;
const selectActiveAgentCount = (directory: AgentDirectory) =>
  directory.identities.filter(agentIsActive).length;

export function useAgentsPoll() {
  return useQuery(agentQueryOptions(useWorkspace()));
}

export function useAgents() {
  return useQuery({
    ...agentQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
  });
}

export function useAgentWorkspace() {
  return useQuery({
    ...agentQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectAgentWorkspace,
  });
}

export function useAgentIdentities() {
  return useQuery({
    ...agentQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectAgentIdentities,
  });
}

export function useAgentSnapshot() {
  return useQuery({
    ...agentQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectAgentSnapshot,
  });
}

export function useAgentStatus() {
  return useQuery({
    ...agentQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectAgentFetchedAt,
  });
}

export function useActiveAgentCount() {
  return useQuery({
    ...agentQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectActiveAgentCount,
  });
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
