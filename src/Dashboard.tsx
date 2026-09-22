import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bot, GitBranch, LayoutGrid } from 'lucide-react';
import { CompletedView } from './components/completed-view';
import { AgentsView } from './components/agents-view';
import { DashboardOverlays } from './components/overlays';
import { DashboardShell } from './components/dashboard-shell';
import { IssueSurface } from './components/issue-surface';
import { Overview } from './components/overview';
import { ErrorNotice, Loading } from './components/issue-parts';
import { ReviewsView } from './components/reviews-view';
import { Button } from './components/ui/button';
import { WorkspaceResourcePolls } from './components/workspace-resource-polls';
import { WorkspaceSwitcher } from './components/workspace-switcher';
import { useAgentWorkspace } from './hooks/use-agents';
import { useBoardSnapshot, useBoardWorkspace } from './hooks/use-cards';
import { useWorkspaces } from './lib/api/workspaces';
import { pinnableWorkspaceId } from './lib/dashboard-search';
import {
  useDashboardActions,
  useDashboardKeys,
  useDashboardMode,
  useWorkspaceId,
} from './lib/navigation';
import { useDashboardStore } from './store';
import { useWorkspacePreferenceStore } from './workspace-preference-store';
import { workspaceIsHidden } from './lib/workspaces';

function resetWorkspaceState(_workspace: string | null): void {
  useDashboardStore.getState().resetWorkspace();
}

export function Dashboard() {
  const mode = useDashboardMode();
  const workspace = useWorkspaceId();
  const hidden = useWorkspacePreferenceStore((state) =>
    workspaceIsHidden(workspace, state.preferences),
  );
  const navigate = useNavigate({ from: '/' });
  useDashboardKeys();
  useEffect(() => {
    if (hidden && mode !== 'overview') {
      resetWorkspaceState(workspace);
      void navigate({
        search: (current) => ({
          ...current,
          mode: 'overview',
          workspace: null,
          issue: null,
          agent: null,
          agentRun: null,
          review: null,
        }),
        replace: true,
      });
    }
  }, [hidden, mode, workspace, navigate]);
  // Guard before mounting any workspace readers, detail polls, or log streams,
  // including direct links and Back navigation to a hidden workspace.
  return mode === 'overview' || hidden ? (
    <>
      <Overview />
      <DashboardOverlays />
    </>
  ) : (
    <WorkspaceDashboard key={workspace} />
  );
}

function WorkspaceInitialization() {
  const workspace = useWorkspaceId();
  const boardWorkspace = useBoardWorkspace();
  const agentWorkspace = useAgentWorkspace();
  const workspaces = useWorkspaces();
  const navigate = useNavigate({ from: '/' });
  const workspacePath = boardWorkspace.data?.path ?? agentWorkspace.data?.path ?? null;
  const defaultWorkspace = pinnableWorkspaceId(workspaces.data ?? [], workspacePath);
  useEffect(() => {
    if (workspace === null && defaultWorkspace)
      void navigate({
        search: (current) => ({ ...current, workspace: defaultWorkspace }),
        replace: true,
      });
  }, [workspace, defaultWorkspace, navigate]);
  useEffect(() => {
    resetWorkspaceState(workspace);
  }, [workspace]);
  return null;
}

function WorkspaceDashboard() {
  return (
    <>
      <WorkspaceResourcePolls />
      <WorkspaceInitialization />
      <WorkspacePage />
    </>
  );
}

function WorkspacePage() {
  const mode = useDashboardMode();
  const board = useBoardSnapshot();
  const actions = useDashboardActions();
  const issueMode = mode !== 'agents' && mode !== 'reviews';
  if (!board.data && issueMode)
    return (
      <div className="startup">
        <div className="brand">
          <span className="brand-icon">
            <GitBranch />
          </span>
          millstrand.
        </div>
        <Button variant="outline" onClick={actions.openOverview}>
          <LayoutGrid />
          All weavers
        </Button>
        <WorkspaceSwitcher workspace={null} />
        <Button variant="outline" onClick={() => actions.setMode('agents')}>
          <Bot />
          Browse agents
        </Button>
        {board.error ? (
          <>
            <ErrorNotice error={board.error} />
            <Button
              onClick={() => {
                void board.refetch();
              }}
            >
              Try again
            </Button>
          </>
        ) : (
          <Loading />
        )}
      </div>
    );
  return (
    <DashboardShell>
      {mode === 'completed' ? (
        <CompletedView />
      ) : mode === 'reviews' ? (
        <ReviewsView />
      ) : mode === 'agents' ? (
        <AgentsView />
      ) : (
        <IssueSurface />
      )}
    </DashboardShell>
  );
}
