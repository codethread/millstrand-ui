import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bookmark,
  Bot,
  Check,
  CircleDot,
  GitBranch,
  GitPullRequest,
  Keyboard,
  LayoutGrid,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useActiveAgentCount, useAgentStatus, useAgentWorkspace } from '../hooks/use-agents';
import { useBoardSidebar, useBoardStatus } from '../hooks/use-cards';
import { useReviewInboxCount, useReviewsStatus } from '../hooks/use-reviews';
import { useSavedViews } from '../hooks/use-views';
import {
  matchesWorkspaceView,
  selectCards,
  viewDescription,
  type WorkspaceView,
} from '../lib/board';
import {
  useActiveViewId,
  useDashboardActions,
  useDashboardMode,
  useIssueFilter,
} from '../lib/navigation';
import { cn } from '../lib/utils';
import { useDashboardStore } from '../store';
import { LabelPill } from './issue-parts';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { WorkspaceSwitcher } from './workspace-switcher';

const workspaceViews = [
  { id: 'all', label: 'All issues', icon: LayoutGrid },
  { id: 'progress', label: 'In progress', icon: CircleDot },
  { id: 'review', label: 'In review', icon: Sparkles },
  { id: 'completed', label: 'Completed', icon: Check },
] satisfies { id: WorkspaceView; label: string; icon: typeof LayoutGrid }[];

function WorkspaceStatus() {
  const mode = useDashboardMode();
  const board = useBoardStatus();
  const agents = useAgentStatus();
  const reviews = useReviewsStatus();
  const client = useQueryClient();
  const resource = mode === 'reviews' ? reviews : mode === 'agents' ? agents : board;
  const fetchedAt =
    mode === 'reviews' ? reviews.data : mode === 'agents' ? agents.data : board.data;
  return (
    <div className="flex items-center justify-between px-2 pb-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={cn('sync-indicator', resource.error && 'disconnected')}>
            <span className="live-dot" />
            {resource.error ? 'Disconnected' : 'Live'}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          Refreshes every 5 seconds · last update {fetchedAt ?? 'waiting for first update'}
        </TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Refresh workspace"
        onClick={() => {
          void client.invalidateQueries();
        }}
      >
        <RefreshCw className={cn(resource.isFetching && 'animate-spin')} />
      </Button>
    </div>
  );
}

function SidebarContents() {
  const board = useBoardSidebar();
  const agentCount = useActiveAgentCount();
  const agentWorkspace = useAgentWorkspace();
  const reviewCount = useReviewInboxCount();
  const views = useSavedViews();
  const mode = useDashboardMode();
  const activeViewId = useActiveViewId();
  const filter = useIssueFilter();
  const actions = useDashboardActions();
  const setSidebarOpen = useDashboardStore((state) => state.setSidebarOpen);
  const openShortcuts = useDashboardStore((state) => state.openShortcuts);
  const active = board.data?.summary ?? null;
  const counts: Record<WorkspaceView, number | null> = {
    all: active?.active ?? null,
    progress: active?.inProgress ?? null,
    review: active?.review ?? null,
    completed: active?.closed ?? null,
  };
  return (
    <>
      <div className="brand">
        <span className="brand-icon">
          <GitBranch className="size-5" />
        </span>
        <span>
          millstrand<span className="brand-dot">.</span>
        </span>
        <button
          className="ml-auto md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        >
          <X className="size-4" />
        </button>
      </div>
      <button className="nav-item mx-3 mb-2" onClick={actions.openOverview}>
        <LayoutGrid />
        All weavers
        <ArrowUpRight className="ml-auto" />
      </button>
      <WorkspaceSwitcher workspace={board.data?.workspace ?? agentWorkspace.data ?? null} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sidebar-section-label">WORKSPACE</div>
        <p className="sidebar-hint">
          {active ? `${active.active} active issues` : 'Issue data unavailable'}
        </p>
        {workspaceViews.map(({ id, label, icon: Icon }) => {
          const selected =
            mode !== 'agents' &&
            mode !== 'reviews' &&
            activeViewId === null &&
            matchesWorkspaceView(filter, id);
          return (
            <button
              key={id}
              className={cn('nav-item', selected && 'active')}
              aria-pressed={selected}
              onClick={() => actions.selectWorkspaceView(id)}
            >
              <Icon />
              {label}
              <span className="nav-count">{counts[id] ?? '—'}</span>
            </button>
          );
        })}
        <button
          className={cn('nav-item', mode === 'agents' && 'active')}
          aria-pressed={mode === 'agents'}
          onClick={() => {
            actions.setMode('agents');
            setSidebarOpen(false);
          }}
        >
          <Bot />
          Agents
          <span className="nav-count">{agentCount.error ? '?' : (agentCount.data ?? '…')}</span>
        </button>
        <button
          className={cn('nav-item', mode === 'reviews' && 'active')}
          aria-pressed={mode === 'reviews'}
          onClick={() => {
            actions.setMode('reviews');
            setSidebarOpen(false);
          }}
        >
          <GitPullRequest />
          Reviews
          <span className="nav-count">{reviewCount.data ?? '—'}</span>
        </button>
        {board.data && (
          <>
            <div className="sidebar-section-label mt-7">
              <span>YOUR VIEWS</span>
              <button aria-label="Create view" onClick={() => actions.editView(null, filter)}>
                <Plus className="size-3.5" />
              </button>
            </div>
            <div className="saved-views">
              {(views.data ?? []).map((view) => (
                <div className="saved-view-row" key={view.id}>
                  <button
                    className={cn(
                      'nav-item flex-1',
                      mode !== 'agents' &&
                        mode !== 'reviews' &&
                        activeViewId === view.id &&
                        'active',
                    )}
                    onClick={() => actions.selectView(view)}
                    title={viewDescription(view)}
                  >
                    <Bookmark />
                    <span className="truncate">{view.name}</span>
                    <span className="nav-count">
                      {selectCards(board.data.cards, view.filter).length}
                    </span>
                  </button>
                  <button
                    className="edit-view-button"
                    onClick={() => actions.editView(view, filter)}
                    aria-label={`Edit view ${view.name}`}
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {views.data?.length === 0 && (
              <p className="sidebar-hint">Make a little space for the work you care about.</p>
            )}
            <button className="nav-item new-view" onClick={() => actions.editView(null, filter)}>
              <Plus />
              Create a view
            </button>
            <div className="sidebar-section-label mt-7">
              LABELS <span>{board.data.labels.length}</span>
            </div>
            <div className="sidebar-labels">
              {board.data.labels.map(({ label, count }) => (
                <button
                  key={label}
                  className={cn('sidebar-label', filter.terms[label] && 'selected')}
                  onClick={() => actions.toggleLabel(label)}
                >
                  <LabelPill label={label} />
                  <span>{count}</span>
                </button>
              ))}
            </div>
            {board.data.labels.length === 0 && (
              <p className="sidebar-hint">Add labels from an issue’s detail panel.</p>
            )}
          </>
        )}
      </div>
      <div className="sidebar-bottom">
        <WorkspaceStatus />
        <button className="nav-item" onClick={openShortcuts}>
          <Keyboard />
          Keyboard shortcuts<kbd>?</kbd>
        </button>
      </div>
    </>
  );
}

export function DashboardSidebar() {
  const open = useDashboardStore((state) => state.sidebarOpen);
  const setOpen = useDashboardStore((state) => state.setSidebarOpen);
  return (
    <>
      <aside className="sidebar desktop-sidebar">
        <SidebarContents />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" showCloseButton={false} className="sidebar-mobile">
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Browse issues, saved views, and labels.
          </SheetDescription>
          <SidebarContents />
        </SheetContent>
      </Sheet>
    </>
  );
}
