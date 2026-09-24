import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgentDirectory } from '../../shared/api';
import { agentQueryOptions, agentReplyQueryOptions } from '../lib/api/agents';
import {
  agentDirectorySummary,
  agentRunIdentities,
  relevantAgentActivity,
  selectedAgentActivity,
  targetAgentRunIds,
} from '../lib/agents';
import { useWorkspace } from './use-workspace';

const selectAgentWorkspace = (directory: AgentDirectory) => directory.workspace;
const selectAgentIdentities = (directory: AgentDirectory) => directory.identities;
const selectAgentFetchedAt = (directory: AgentDirectory) => directory.fetchedAt;
const selectAgentSnapshot = () => true;
const selectAgentSummary = (directory: AgentDirectory) => agentDirectorySummary(directory);
const selectAgentRunIdentities = (directory: AgentDirectory) =>
  agentRunIdentities(directory.identities);

function agentReaderOptions(workspace: string | null) {
  return {
    ...agentQueryOptions(workspace),
    enabled: false,
    refetchInterval: false,
  } as const;
}

export function useAgentsPoll() {
  return useQuery(agentQueryOptions(useWorkspace()));
}

export function useAgentWorkspace() {
  return useQuery({
    ...agentReaderOptions(useWorkspace()),
    select: selectAgentWorkspace,
  });
}

/** Directory content only. Fetch health belongs to useAgentStatus. */
export function useAgentIdentities() {
  return useQuery({
    ...agentReaderOptions(useWorkspace()),
    select: selectAgentIdentities,
  });
}

export function useAgentDirectory() {
  return useQuery(agentReaderOptions(useWorkspace()));
}

export function useAgentSnapshot() {
  return useQuery({
    ...agentReaderOptions(useWorkspace()),
    select: selectAgentSnapshot,
  });
}

/** The directory refresh-health reader; data is the latest successful fetchedAt value. */
export function useAgentStatus() {
  return useQuery({
    ...agentReaderOptions(useWorkspace()),
    select: selectAgentFetchedAt,
  });
}

export function useAgentSummary() {
  return useQuery({
    ...agentReaderOptions(useWorkspace()),
    select: selectAgentSummary,
  });
}

export function useRelevantAgentActivity(owner: string | null, target: string) {
  const select = useCallback(
    (directory: AgentDirectory) =>
      relevantAgentActivity(directory.identities, directory.runs, owner, target),
    [owner, target],
  );
  return useQuery({
    ...agentReaderOptions(useWorkspace()),
    select,
  });
}

export function useSelectedAgentActivity(identityId: string | null, runId: string | null) {
  const select = useCallback(
    (directory: AgentDirectory) => selectedAgentActivity(directory, identityId, runId),
    [identityId, runId],
  );
  return useQuery({
    ...agentReaderOptions(useWorkspace()),
    select,
  });
}

export function useAgentRunIdentities() {
  return useQuery({
    ...agentReaderOptions(useWorkspace()),
    select: selectAgentRunIdentities,
  });
}

export function useTargetAgentRunIds(target: string) {
  const select = useCallback(
    (directory: AgentDirectory) => targetAgentRunIds(directory.runs, target),
    [target],
  );
  return useQuery({
    ...agentReaderOptions(useWorkspace()),
    select,
  });
}

/** Reply polling deliberately remains enabled for terminal runs so late results stay observable. */
export function useAgentReply(id: string, enabled: boolean) {
  return useQuery(agentReplyQueryOptions(useWorkspace(), id, enabled));
}
