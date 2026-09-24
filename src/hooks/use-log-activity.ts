import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgentDirectory } from '../../shared/api';
import type { LogActivity } from '../../shared/log-activity';
import { agentQueryOptions } from '../lib/api/agents';
import { graphQueryOptions } from '../lib/api/cards';
import { logActivityOptions } from '../lib/api/log-activity';
import { cardLogAgents, cardLogTasks } from '../lib/agent-logs';
import { useWorkspace } from './use-workspace';

export function useLogActivityPoll() {
  return useQuery(logActivityOptions(useWorkspace()));
}
export function useLogBinding(workspace: string | null, identityStrandId: string) {
  const select = useCallback(
    (data: LogActivity) =>
      data.bindings.find((binding) => binding.identityStrandId === identityStrandId) ?? null,
    [identityStrandId],
  );
  return useQuery({
    ...logActivityOptions(workspace),
    enabled: false,
    refetchInterval: false,
    select,
  });
}
/** The visible card log owns the descendant graph poll; agent freshness stays workspace-owned. */
export function useCardLogAgents(owner: string | null, target: string) {
  const workspace = useWorkspace();
  const tasks = useQuery({ ...graphQueryOptions(workspace, target), select: cardLogTasks });
  const taskData = tasks.data;
  const select = useCallback(
    (data: AgentDirectory) =>
      cardLogAgents(data.identities, owner, target, taskData ?? [], data.runs),
    [owner, target, taskData],
  );
  const agents = useQuery({
    ...agentQueryOptions(workspace),
    enabled: false,
    refetchInterval: false,
    select,
  });
  return {
    data: agents.data,
    error: agents.error,
    isPending: agents.isPending,
    tasksPending: tasks.isPending,
    tasksError: tasks.error,
  };
}
