import { useQueries } from '@tanstack/react-query';
import { useWorkspaces } from '../lib/api/workspaces';
import { logActivityOptions } from '../lib/api/log-activity';
import { logLabEnabled } from '../lib/agent-logs';

/** Overview-only log summary owner, disjoint from WorkspaceResourcePolls. */
export function OverviewLogPolls() {
  const workspaces = useWorkspaces();
  useQueries({
    queries: (workspaces.data ?? []).map((workspace) => ({
      ...logActivityOptions(workspace.id),
      enabled: logLabEnabled && workspace.status === 'running',
      refetchInterval: workspace.status === 'running' ? 5000 : false,
    })),
  });
  return null;
}
