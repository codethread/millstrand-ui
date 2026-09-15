import { ReviewsView, ReviewSearchControls } from './components/reviews-view';
import { reviewInInbox } from './lib/reviews';
import { lazy, Suspense, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
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
  ListTree,
  Maximize,
  Minimize,
  Menu,
  Network,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useAgents, useReviews, useBoard, useViews, useWorkspaces } from './lib/api';
import {
  boardSummary,
  emptyFilter,
  matchesWorkspaceView,
  selectCards,
  viewDescription,
  type WorkspaceView,
} from './lib/board';
import { useDashboardKeys, useDashboardNavigation } from './lib/navigation';
import { useDashboardStore } from './store';
import { pinnableWorkspaceId, type Presentation } from './lib/dashboard-search';
import { cn } from './lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './components/ui/sheet';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip';
import { BoardView, EmptyBoard, OutlineView } from './components/board-view';
import { ErrorNotice, LabelPill, Loading } from './components/issue-parts';
import { IssueDetail } from './components/issue-detail';
import { WorkspaceSwitcher } from './components/workspace-switcher';
import { Overview } from './components/overview';
import { AgentPromptDialog } from './components/agent-prompt';
import { useAgentPromptStore } from './agent-prompt-store';
import { AgentNotifications } from './components/agent-notifications';
import { CardActionFeedback } from './components/card-actions';
import { DashboardOverlays } from './components/overlays';
import { AgentDetail, AgentSearchControls, AgentsView } from './components/agents-view';
import { agentIsActive } from './lib/agents';
import type { Board, SavedView } from '../shared/api';
import { DashboardFilters } from './components/dashboard-filters';

const GraphView = lazy(() => import('./components/graph-view'));
const modes = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'graph', label: 'Graph', icon: Network },
] satisfies { id: Presentation; label: string; icon: typeof LayoutGrid }[];

interface SidebarProps {
  board: Board | null;
  views: SavedView[];
  connected: boolean;
  refreshing: boolean;
}

function SidebarContents({ board, views, connected, refreshing }: SidebarProps) {
  const s = useDashboardStore();
  const client = useQueryClient();
  const active = board ? boardSummary(board) : null;
  const nav = useDashboardNavigation();
  const agents = useAgents();
  const reviews = useReviews();
  const workspaceViews = [
    { id: 'all', label: 'All issues', count: active?.active ?? null, icon: LayoutGrid },
    { id: 'progress', label: 'In progress', count: active?.inProgress ?? null, icon: CircleDot },
    { id: 'review', label: 'In review', count: active?.review ?? null, icon: Sparkles },
    { id: 'completed', label: 'Completed', count: active?.closed ?? null, icon: Check },
  ] satisfies { id: WorkspaceView; label: string; count: number | null; icon: typeof LayoutGrid }[];
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
          onClick={() => s.setSidebarOpen(false)}
          aria-label="Close navigation"
        >
          <X className="size-4" />
        </button>
      </div>
      <button className="nav-item mx-3 mb-2" onClick={nav.openOverview}>
        <LayoutGrid />
        All weavers
        <ArrowUpRight className="ml-auto" />
      </button>
      <WorkspaceSwitcher workspace={board?.workspace ?? agents.data?.workspace ?? null} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sidebar-section-label">WORKSPACE</div>
        <p className="sidebar-hint">
          {active ? `${active.active} active issues` : 'Issue data unavailable'}
        </p>
        {workspaceViews.map(({ id, label, count, icon: Icon }) => {
          const selected =
            nav.mode !== 'agents' &&
            nav.mode !== 'reviews' &&
            nav.activeViewId === null &&
            matchesWorkspaceView(nav.filter, id);
          return (
            <button
              key={id}
              className={cn('nav-item', selected && 'active')}
              aria-pressed={selected}
              onClick={() => {
                nav.selectWorkspaceView(id);
              }}
            >
              <Icon />
              {label}
              <span className="nav-count">{count ?? '—'}</span>
            </button>
          );
        })}
        <button
          className={cn('nav-item', nav.mode === 'agents' && 'active')}
          aria-pressed={nav.mode === 'agents'}
          onClick={() => {
            nav.setMode('agents');
            s.setSidebarOpen(false);
          }}
        >
          <Bot />
          Agents
          <span className="nav-count">
            {agents.error ? '?' : (agents.data?.identities.filter(agentIsActive).length ?? '…')}
          </span>
        </button>
        <button
          className={cn('nav-item', nav.mode === 'reviews' && 'active')}
          aria-pressed={nav.mode === 'reviews'}
          onClick={() => {
            nav.setMode('reviews');
            s.setSidebarOpen(false);
          }}
        >
          <GitPullRequest />
          Reviews
          <span className="nav-count">
            {reviews.data?.kind === 'available'
              ? reviews.data.reviews.filter(reviewInInbox).length
              : '—'}
          </span>
        </button>
        {board && (
          <>
            <div className="sidebar-section-label mt-7">
              <span>YOUR VIEWS</span>
              <button aria-label="Create view" onClick={() => nav.editView(null)}>
                <Plus className="size-3.5" />
              </button>
            </div>
            <div className="saved-views">
              {views.map((view) => (
                <div className="saved-view-row" key={view.id}>
                  <button
                    className={cn(
                      'nav-item flex-1',
                      nav.mode !== 'agents' &&
                        nav.mode !== 'reviews' &&
                        nav.activeViewId === view.id &&
                        'active',
                    )}
                    onClick={() => {
                      nav.selectView(view);
                    }}
                    title={viewDescription(view)}
                  >
                    <Bookmark />
                    <span className="truncate">{view.name}</span>
                    <span className="nav-count">
                      {selectCards(board.cards, view.filter).length}
                    </span>
                  </button>
                  <button
                    className="edit-view-button"
                    onClick={() => nav.editView(view)}
                    aria-label={`Edit view ${view.name}`}
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {views.length === 0 && (
              <p className="sidebar-hint">Make a little space for the work you care about.</p>
            )}
            <button className="nav-item new-view" onClick={() => nav.editView(null)}>
              <Plus />
              Create a view
            </button>
            <div className="sidebar-section-label mt-7">
              LABELS <span>{board.labels.length}</span>
            </div>
            <div className="sidebar-labels">
              {board.labels.map(({ label, count }) => (
                <button
                  key={label}
                  className={cn('sidebar-label', nav.filter.terms[label] && 'selected')}
                  onClick={() => {
                    nav.toggleLabel(label);
                  }}
                >
                  <LabelPill label={label} />
                  <span>{count}</span>
                </button>
              ))}
            </div>
            {board.labels.length === 0 && (
              <p className="sidebar-hint">Add labels from an issue’s detail panel.</p>
            )}
          </>
        )}
      </div>
      <div className="sidebar-bottom">
        <div className="flex items-center justify-between px-2 pb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className={cn('sync-indicator', !connected && 'disconnected')}>
                <span className="live-dot" />
                {connected ? 'Live' : 'Disconnected'}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Refreshes every 5 seconds · last update{' '}
              {(nav.mode === 'reviews'
                ? reviews.data?.kind === 'available'
                  ? reviews.data.fetchedAt
                  : null
                : nav.mode === 'agents'
                  ? agents.data?.fetchedAt
                  : board?.fetchedAt) ?? 'waiting for first update'}
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
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
          </Button>
        </div>
        <button className="nav-item" onClick={s.openShortcuts}>
          <Keyboard />
          Keyboard shortcuts<kbd>?</kbd>
        </button>
      </div>
    </>
  );
}

function Sidebar(props: SidebarProps) {
  const open = useDashboardStore((state) => state.sidebarOpen);
  const setOpen = useDashboardStore((state) => state.setSidebarOpen);
  return (
    <>
      <aside className="sidebar desktop-sidebar">
        <SidebarContents {...props} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" showCloseButton={false} className="sidebar-mobile">
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Browse issues, saved views, and labels.
          </SheetDescription>
          <SidebarContents {...props} />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function Dashboard() {
  const nav = useDashboardNavigation();
  useDashboardKeys();
  return nav.mode === 'overview' ? (
    <>
      <Overview />
      <DashboardOverlays board={null} views={[]} viewsReady={false} />
    </>
  ) : (
    <WorkspaceDashboard key={nav.workspace} />
  );
}

function resetWorkspaceState(_workspace: string | null): void {
  useDashboardStore.getState().resetWorkspace();
  useAgentPromptStore.getState().close();
}

function WorkspaceDashboard() {
  const board = useBoard();
  const agents = useAgents();
  const reviews = useReviews();
  const views = useViews();
  const workspaces = useWorkspaces();
  const s = useDashboardStore();
  const nav = useDashboardNavigation();
  const navigate = useNavigate({ from: '/' });
  const workspacePath = board.data?.workspace.path ?? agents.data?.workspace.path ?? null;
  const defaultWorkspace = pinnableWorkspaceId(workspaces.data ?? [], workspacePath);
  const workspace = nav.workspace;
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
  if (!board.data && nav.mode !== 'agents' && nav.mode !== 'reviews')
    return (
      <div className="startup">
        <div className="brand">
          <span className="brand-icon">
            <GitBranch />
          </span>
          millstrand.
        </div>
        <Button variant="outline" onClick={nav.openOverview}>
          <LayoutGrid />
          All weavers
        </Button>
        <WorkspaceSwitcher workspace={null} />
        <Button variant="outline" onClick={() => nav.setMode('agents')}>
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
  const data = board.data ?? null;
  const allCards = data?.cards ?? [];
  const cards = selectCards(allCards, nav.filter);
  const selectedView = views.data?.find((view) => view.id === nav.activeViewId);
  const isFiltered = JSON.stringify(nav.filter) !== JSON.stringify(emptyFilter());
  return (
    <div className={cn('app-shell', s.contentFullscreen && 'content-fullscreen')}>
      <Sidebar
        board={data}
        views={views.data ?? []}
        connected={
          nav.mode === 'reviews'
            ? !reviews.error
            : nav.mode === 'agents'
              ? !agents.error
              : !board.error
        }
        refreshing={
          nav.mode === 'reviews'
            ? reviews.isFetching
            : nav.mode === 'agents'
              ? agents.isFetching
              : board.isFetching
        }
      />
      <main
        className="main-workspace"
        aria-label={
          nav.mode === 'reviews' ? 'Reviews' : nav.mode === 'agents' ? 'Agents' : 'Issues'
        }
      >
        <header className="workspace-header">
          <div className="view-toolbar">
            <Button
              className="md:hidden"
              variant="ghost"
              size="icon-sm"
              aria-label="Open navigation"
              onClick={() => s.setSidebarOpen(true)}
            >
              <Menu />
            </Button>
            {nav.mode === 'reviews' ? (
              <h1 className="flex h-[38px] items-center gap-2 text-sm! tracking-normal!">
                <GitPullRequest className="size-4 text-primary" />
                Reviews
              </h1>
            ) : nav.mode === 'agents' ? (
              <h1 className="flex h-[38px] items-center gap-2 text-sm! tracking-normal!">
                <Bot className="size-4 text-primary" />
                Agents
              </h1>
            ) : (
              <div className="view-tabs" aria-label="View layout">
                {modes.map(({ id, label, icon: Icon }) => (
                  <button
                    aria-pressed={nav.mode === id}
                    className={cn(nav.mode === id && 'selected')}
                    key={id}
                    onClick={() => nav.setMode(id)}
                  >
                    <Icon />
                    {label}
                  </button>
                ))}
              </div>
            )}
            <AgentNotifications />
            {nav.mode === 'reviews' ? (
              <ReviewSearchControls />
            ) : nav.mode === 'agents' ? (
              <AgentSearchControls />
            ) : (
              <div className="toolbar-actions">
                <div className="search-field">
                  <Search />
                  <Input
                    id="issue-search"
                    aria-label="Search issues"
                    placeholder="Search issues…"
                    value={nav.filter.query}
                    onChange={(event) => nav.setQuery(event.target.value)}
                  />
                  {nav.filter.query ? (
                    <button aria-label="Clear search" onClick={() => nav.setQuery('')}>
                      <X className="size-3" />
                    </button>
                  ) : (
                    <kbd>{s.shortcuts.search}</kbd>
                  )}
                </div>
                <DashboardFilters />
                <button
                  className={cn('closed-toggle', nav.filter.includeClosed && 'selected')}
                  onClick={nav.toggleClosed}
                  aria-pressed={nav.filter.includeClosed}
                >
                  <Check className="size-3.5" />
                  Include completed
                </button>
              </div>
            )}
          </div>
          {nav.mode !== 'agents' && nav.mode !== 'reviews' && (
            <div className="view-context">
              <span>
                {cards.length} {cards.length === 1 ? 'issue' : 'issues'}
                <span className="context-dot">·</span>
                {selectedView?.name ?? (nav.filter.includeClosed ? 'All activity' : 'Active work')}
                {nav.mode === 'board' && (
                  <>
                    <span className="context-dot">·</span>Grouped by status
                  </>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(nav.filter.terms).map(([label, term]) => (
                  <button
                    key={label}
                    className="active-filter"
                    onClick={() => nav.toggleLabel(label)}
                  >
                    {term === 'exclude' ? '−' : '#'}
                    {label}
                    <X className="size-3" />
                  </button>
                ))}
                {isFiltered && (
                  <button className="reset-filters" onClick={nav.resetFilters}>
                    Clear filters
                  </button>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="save-view-button ml-auto"
                onClick={() =>
                  nav.editView(selectedView ? { ...selectedView, filter: nav.filter } : null)
                }
              >
                <Bookmark />
                {selectedView ? 'Edit view' : 'Save view'}
              </Button>
            </div>
          )}
        </header>
        {board.error && nav.mode !== 'agents' && nav.mode !== 'reviews' && (
          <ErrorNotice error={board.error} />
        )}
        {views.error && nav.mode !== 'agents' && nav.mode !== 'reviews' && (
          <ErrorNotice error={views.error} />
        )}
        {agents.error && (
          <div
            role="alert"
            className="mx-4 my-2 flex flex-wrap items-center gap-2 text-xs text-destructive"
          >
            Agent activity unavailable{agents.data ? ' · showing last known sessions' : ''}.
            <button
              className="underline"
              onClick={() => {
                void agents.refetch();
              }}
            >
              Retry
            </button>
          </div>
        )}
        <CardActionFeedback />
        <section className="working-content" aria-label={`${nav.mode} content`}>
          <Button
            variant="outline"
            size="icon-sm"
            className="content-fullscreen-toggle"
            aria-label={s.contentFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={s.contentFullscreen ? 'Exit fullscreen (Esc)' : 'Expand content to fullscreen'}
            aria-pressed={s.contentFullscreen}
            onClick={() => s.setContentFullscreen(!s.contentFullscreen)}
          >
            {s.contentFullscreen ? <Minimize /> : <Maximize />}
          </Button>
          {nav.mode === 'reviews' ? (
            <ReviewsView />
          ) : nav.mode === 'agents' ? (
            <AgentsView />
          ) : nav.mode === 'graph' ? (
            <Suspense fallback={<Loading text="Loading graph…" />}>
              <GraphView cards={cards} allCards={allCards} />
            </Suspense>
          ) : cards.length === 0 ? (
            <EmptyBoard />
          ) : nav.mode === 'board' ? (
            <BoardView cards={cards} allCards={allCards} />
          ) : (
            <OutlineView cards={cards} allCards={allCards} />
          )}
        </section>
      </main>
      {nav.issue && <IssueDetail key={`${nav.workspace}:${nav.issue}`} id={nav.issue} />}
      {nav.agent && <AgentDetail key={nav.agent} id={nav.agent} />}
      <DashboardOverlays board={data} views={views.data ?? []} viewsReady={views.isSuccess} />
      <AgentPromptDialog />
    </div>
  );
}
