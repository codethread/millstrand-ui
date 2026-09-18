import { useMemo } from 'react';
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { AgentDirectory, AgentIdentity, Board, Card, WorkspaceOption } from '../../shared/api';
import { agentQueryOptions } from '../lib/api/agents';
import { boardQueryOptions } from '../lib/api/cards';
import { useWorkspaces } from '../lib/api/workspaces';
import { activeAgentIdentities } from '../lib/agents';
import {
  overviewActivity,
  overviewCards,
  workspaceActivity,
  type ActivityHealth,
  type AgentActivity,
  type CardActivity,
} from '../lib/overview';

type DiscoveryHealth = { kind: 'loading' } | { kind: 'live' } | { kind: 'failed'; error: Error };

const noWorkspaces: WorkspaceOption[] = [];
const selectCards = (board: Board) => overviewCards(board.cards);
const selectAgents = (directory: AgentDirectory) => activeAgentIdentities(directory.identities);

function activityHealth(
  status: 'pending' | 'error' | 'success',
  error: Error | null,
): ActivityHealth {
  if (error) return { kind: 'failed', message: error.message };
  return { kind: status === 'pending' ? 'loading' : 'live' };
}

// Stable combines let Query structurally share concrete results; no fetch metadata,
// refetch functions, or full query wrappers escape into the presentation contract.
function combineBoards(results: UseQueryResult<Card[]>[]): CardActivity[] {
  return results.map(({ data, status, error }) => ({
    data: data ?? null,
    health: activityHealth(status, error),
  }));
}

function combineAgents(results: UseQueryResult<AgentIdentity[]>[]): AgentActivity[] {
  return results.map(({ data, status, error }) => ({
    data: data ?? null,
    health: activityHealth(status, error),
  }));
}

/** Overview's sole board/agent poll owner, mounted only outside WorkspacePage. */
export function useOverview() {
  const discovery = useWorkspaces();
  const options = discovery.data ?? noWorkspaces;
  const client = useQueryClient();
  const boards = useQueries({
    queries: options.map((workspace) => ({
      ...boardQueryOptions(workspace.id),
      enabled: workspace.status === 'running',
      refetchInterval: workspace.status === 'running' ? 5000 : false,
      select: selectCards,
    })),
    combine: combineBoards,
  });
  const agents = useQueries({
    queries: options.map((workspace) => ({
      ...agentQueryOptions(workspace.id),
      enabled: workspace.status === 'running',
      refetchInterval: workspace.status === 'running' ? 5000 : false,
      select: selectAgents,
    })),
    combine: combineAgents,
  });
  const activity = useMemo(
    () =>
      overviewActivity(
        // useQueries guarantees one result per input, in input order. Discovery
        // changes rebuild both query lists by workspace key, never by cached index.
        options.map((workspace, index) =>
          workspaceActivity(workspace, boards[index]!, agents[index]!),
        ),
      ),
    [options, boards, agents],
  );
  function refreshSource(workspace: WorkspaceOption, source: 'board' | 'agents') {
    if (workspace.status !== 'running') return;
    void client.invalidateQueries({ queryKey: [source, workspace.id], exact: true });
  }
  function refreshAll() {
    void client.invalidateQueries({ queryKey: ['workspaces'], exact: true });
    for (const workspace of options) {
      refreshSource(workspace, 'board');
      refreshSource(workspace, 'agents');
    }
  }
  const discoveryHealth: DiscoveryHealth = discovery.error
    ? { kind: 'failed', error: discovery.error }
    : { kind: discovery.isPending ? 'loading' : 'live' };
  return { discoveryHealth, options, activity, refreshSource, refreshAll };
}
