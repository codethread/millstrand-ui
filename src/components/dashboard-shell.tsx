import type { ReactNode } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { useAgentSnapshot, useAgentStatus } from '../hooks/use-agents';
import { useBoardSnapshot } from '../hooks/use-cards';
import { useViewsSnapshot } from '../hooks/use-views';
import {
  useDashboardMode,
  useSelectedAgent,
  useSelectedAgentRun,
  useSelectedIssue,
  useWorkspaceId,
} from '../lib/navigation';
import { cn } from '../lib/utils';
import { useDashboardStore } from '../store';
import { AgentDetail } from './agent-detail';
import { CardActionFeedback } from './card-actions';
import { DashboardHeader } from './dashboard-header';
import { DashboardOverlays } from './overlays';
import { DashboardSidebar } from './dashboard-sidebar';
import { IssueDetail } from './issue-detail';
import { ErrorNotice } from './issue-parts';
import { Button } from './ui/button';

function WorkspaceNotices() {
  const mode = useDashboardMode();
  const board = useBoardSnapshot();
  const views = useViewsSnapshot();
  const agentSnapshot = useAgentSnapshot();
  const agentHealth = useAgentStatus();
  const issueMode = mode !== 'agents' && mode !== 'reviews';
  return (
    <>
      {board.error && issueMode && <ErrorNotice error={board.error} />}
      {views.error && issueMode && <ErrorNotice error={views.error} />}
      {agentHealth.error && (
        <div
          role="alert"
          className="mx-4 my-2 flex flex-wrap items-center gap-2 text-xs text-destructive"
        >
          <span className="break-words">
            Agent activity unavailable
            {agentSnapshot.data ? ' · showing last known sessions' : ''}:{' '}
            {agentHealth.error.message}
          </span>
          <button
            className="underline"
            onClick={() => {
              void agentHealth.refetch();
            }}
          >
            Retry
          </button>
        </div>
      )}
    </>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const mode = useDashboardMode();
  const workspace = useWorkspaceId();
  const issue = useSelectedIssue();
  const agent = useSelectedAgent();
  const agentRun = useSelectedAgentRun();
  const contentFullscreen = useDashboardStore((state) => state.contentFullscreen);
  const setContentFullscreen = useDashboardStore((state) => state.setContentFullscreen);
  return (
    <div className={cn('app-shell', contentFullscreen && 'content-fullscreen')}>
      <DashboardSidebar />
      <main
        className="main-workspace"
        aria-label={mode === 'reviews' ? 'Reviews' : mode === 'agents' ? 'Agents' : 'Issues'}
      >
        <DashboardHeader />
        <WorkspaceNotices />
        <CardActionFeedback />
        <section className="working-content" aria-label={`${mode} content`}>
          <Button
            variant="outline"
            size="icon-sm"
            className="content-fullscreen-toggle"
            aria-label={contentFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={contentFullscreen ? 'Exit fullscreen (Esc)' : 'Expand content to fullscreen'}
            aria-pressed={contentFullscreen}
            onClick={() => setContentFullscreen(!contentFullscreen)}
          >
            {contentFullscreen ? <Minimize /> : <Maximize />}
          </Button>
          {children}
        </section>
      </main>
      {issue && <IssueDetail key={`${workspace}:${issue}`} id={issue} />}
      {(agent || agentRun) && (
        <AgentDetail
          key={`${workspace}:${agent ?? ''}:${agentRun ?? ''}`}
          identityId={agent}
          runId={agentRun}
        />
      )}
      <DashboardOverlays />
    </div>
  );
}
