import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgentDirectory } from '../../shared/api';
import type { LogActivity } from '../../shared/log-activity';
import { agentQueryOptions } from '../lib/api/agents';
import { logActivityOptions } from '../lib/api/log-activity';
import { cardLogAgents, logLabEnabled } from '../lib/agent-logs';
import { useWorkspace } from './use-workspace';

export function useLogActivityPoll() {
  return useQuery({ ...logActivityOptions(useWorkspace()), enabled: logLabEnabled });
}
export function useLogBinding(workspace: string | null, identity: string) {
  const select = useCallback(
    (data: LogActivity) => data.bindings.find((binding) => binding.identity === identity) ?? null,
    [identity],
  );
  return useQuery({
    ...logActivityOptions(workspace),
    enabled: false,
    refetchInterval: false,
    select,
  });
}
export function useCardLogAgents(owner: string | null, target: string) {
  const select = useCallback(
    (data: AgentDirectory) => cardLogAgents(data.identities, owner, target),
    [owner, target],
  );
  return useQuery({
    ...agentQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select,
  });
}
