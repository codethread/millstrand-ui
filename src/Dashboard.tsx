import { lazy, Suspense, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  Check,
  ChevronDown,
  CircleDot,
  Filter,
  GitBranch,
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
import { useBoard, useViews } from './lib/api';
import {
  boardSummary,
  emptyFilter,
  lanes,
  matchesWorkspaceView,
  selectCards,
  viewDescription,
  type WorkspaceView,
} from './lib/board';
import { useDashboardKeys, useDashboardNavigation } from './lib/navigation';
import { useDashboardStore, type Presentation } from './store';
import { cn } from './lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './components/ui/sheet';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip';
import { BoardView, EmptyBoard, OutlineView } from './components/board-view';
import { ErrorNotice, LabelPill, Loading, StatusIcon } from './components/issue-parts';
import { IssueDetail } from './components/issue-detail';
import { WorkspaceSwitcher } from './components/workspace-switcher';
import { DashboardOverlays } from './components/overlays';
import type { Board, CardType, Priority, SavedView } from '../shared/api';

const GraphView = lazy(() => import('./components/graph-view'));
const modes = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'graph', label: 'Graph', icon: Network },
] satisfies { id: Presentation; label: string; icon: typeof LayoutGrid }[];

interface SidebarProps {
  board: Board;
  views: SavedView[];
  connected: boolean;
  refreshing: boolean;
}

function SidebarContents({ board, views, connected, refreshing }: SidebarProps) {
  const s = useDashboardStore();
  const client = useQueryClient();
  const active = boardSummary(board);
  const workspaceViews = [
    { id: 'all', label: 'All issues', count: active.active, icon: LayoutGrid },
    { id: 'progress', label: 'In progress', count: active.inProgress, icon: CircleDot },
    { id: 'review', label: 'In review', count: active.review, icon: Sparkles },
    { id: 'completed', label: 'Completed', count: active.closed, icon: Check },
  ] satisfies { id: WorkspaceView; label: string; count: number; icon: typeof LayoutGrid }[];
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
      <WorkspaceSwitcher workspace={board.workspace} />
      <div className="sidebar-section-label">WORKSPACE</div>
      <p className="sidebar-hint">{active.active} active issues</p>
      {workspaceViews.map(({ id, label, count, icon: Icon }) => {
        const selected = s.activeViewId === null && matchesWorkspaceView(s.filter, id);
        return (
          <button
            key={id}
            className={cn('nav-item', selected && 'active')}
            aria-pressed={selected}
            onClick={() => s.selectWorkspaceView(id)}
          >
            <Icon />
            {label}
            <span className="nav-count">{count}</span>
          </button>
        );
      })}
      <div className="sidebar-section-label mt-7">
        <span>YOUR VIEWS</span>
        <button aria-label="Create view" onClick={() => s.editView(null)}>
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="saved-views">
        {views.map((view) => (
          <div className="saved-view-row" key={view.id}>
            <button
              className={cn('nav-item flex-1', s.activeViewId === view.id && 'active')}
              onClick={() => s.selectView(view)}
              title={viewDescription(view)}
            >
              <Bookmark />
              <span className="truncate">{view.name}</span>
              <span className="nav-count">{selectCards(board.cards, view.filter).length}</span>
            </button>
            <button
              className="edit-view-button"
              onClick={() => s.editView(view)}
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
      <button className="nav-item new-view" onClick={() => s.editView(null)}>
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
            className={cn('sidebar-label', s.filter.terms[label] && 'selected')}
            onClick={() => s.toggleLabel(label)}
          >
            <LabelPill label={label} />
            <span>{count}</span>
          </button>
        ))}
      </div>
      {board.labels.length === 0 && (
        <p className="sidebar-hint">Add labels from an issue’s detail panel.</p>
      )}
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
              {new Date(board.fetchedAt).toLocaleTimeString()}
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

function Filters() {
  const s = useDashboardStore();
  const count = s.filter.lanes.length + s.filter.types.length + s.filter.priorities.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter />
          Filters{count > 0 && <span className="filter-count">{count}</span>}
          <ChevronDown className="size-3!" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="filter-popover">
          <strong>Refine this view</strong>
          <span className="filter-heading">STATUS</span>
          <div className="flex flex-wrap gap-1.5">
            {lanes
              .filter((lane) => lane.id !== 'unknown')
              .map((lane) => (
                <button
                  key={lane.id}
                  className={cn('filter-chip', s.filter.lanes.includes(lane.id) && 'selected')}
                  onClick={() => s.toggleLane(lane.id)}
                >
                  <StatusIcon status={lane.id} />
                  {lane.title}
                </button>
              ))}
          </div>
          <span className="filter-heading">TYPE</span>
          <div className="flex gap-1.5">
            {(['epic', 'feature'] satisfies CardType[]).map((type) => (
              <button
                key={type}
                className={cn(
                  'filter-chip capitalize',
                  s.filter.types.includes(type) && 'selected',
                )}
                onClick={() => s.toggleType(type)}
              >
                {type}
              </button>
            ))}
          </div>
          <span className="filter-heading">PRIORITY</span>
          <div className="flex gap-1.5">
            {(['p1', 'p2', 'p3', 'p4'] satisfies Priority[]).map((priority) => (
              <button
                key={priority}
                className={cn(
                  'filter-chip uppercase',
                  s.filter.priorities.includes(priority) && 'selected',
                )}
                onClick={() => s.togglePriority(priority)}
              >
                {priority}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={s.resetFilters}>
            Reset filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Dashboard() {
  const board = useBoard();
  const views = useViews();
  const s = useDashboardStore();
  const nav = useDashboardNavigation();
  useDashboardKeys();
  useEffect(() => {
    useDashboardStore.getState().resetWorkspace();
  }, [nav.workspace]);
  if (!board.data)
    return (
      <div className="startup">
        <div className="brand">
          <span className="brand-icon">
            <GitBranch />
          </span>
          millstrand.
        </div>
        <WorkspaceSwitcher workspace={null} />
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
  const data = board.data;
  const cards = selectCards(data.cards, s.filter);
  const selectedView = views.data?.find((view) => view.id === s.activeViewId);
  const isFiltered = JSON.stringify(s.filter) !== JSON.stringify(emptyFilter());
  return (
    <div className={cn('app-shell', s.contentFullscreen && 'content-fullscreen')}>
      <Sidebar
        board={data}
        views={views.data ?? []}
        connected={!board.error}
        refreshing={board.isFetching}
      />
      <main className="main-workspace" aria-label="Issues">
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
            <div className="toolbar-actions">
              <div className="search-field">
                <Search />
                <Input
                  id="issue-search"
                  aria-label="Search issues"
                  placeholder="Search issues…"
                  value={s.filter.query}
                  onChange={(event) => s.setQuery(event.target.value)}
                />
                {s.filter.query ? (
                  <button aria-label="Clear search" onClick={() => s.setQuery('')}>
                    <X className="size-3" />
                  </button>
                ) : (
                  <kbd>{s.shortcuts.search}</kbd>
                )}
              </div>
              <Filters />
              <button
                className={cn('closed-toggle', s.filter.includeClosed && 'selected')}
                onClick={s.toggleClosed}
                aria-pressed={s.filter.includeClosed}
              >
                <Check className="size-3.5" />
                Include completed
              </button>
            </div>
          </div>
          <div className="view-context">
            <span>
              {cards.length} {cards.length === 1 ? 'issue' : 'issues'}
              <span className="context-dot">·</span>
              {selectedView?.name ?? (s.filter.includeClosed ? 'All activity' : 'Active work')}
              {nav.mode === 'board' && (
                <>
                  <span className="context-dot">·</span>Grouped by status
                </>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(s.filter.terms).map(([label, term]) => (
                <button key={label} className="active-filter" onClick={() => s.toggleLabel(label)}>
                  {term === 'exclude' ? '−' : '#'}
                  {label}
                  <X className="size-3" />
                </button>
              ))}
              {isFiltered && (
                <button className="reset-filters" onClick={s.resetFilters}>
                  Clear filters
                </button>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="save-view-button ml-auto"
              onClick={() =>
                s.editView(selectedView ? { ...selectedView, filter: s.filter } : null)
              }
            >
              <Bookmark />
              {selectedView ? 'Edit view' : 'Save view'}
            </Button>
          </div>
        </header>
        {board.error && <ErrorNotice error={board.error} />}
        {views.error && <ErrorNotice error={views.error} />}
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
          {nav.mode === 'graph' ? (
            <Suspense fallback={<Loading text="Loading graph…" />}>
              <GraphView cards={cards} allCards={data.cards} />
            </Suspense>
          ) : cards.length === 0 ? (
            <EmptyBoard />
          ) : nav.mode === 'board' ? (
            <BoardView cards={cards} allCards={data.cards} />
          ) : (
            <OutlineView cards={cards} allCards={data.cards} />
          )}
        </section>
      </main>
      {nav.issue && <IssueDetail key={nav.issue} id={nav.issue} />}
      <DashboardOverlays board={data} views={views.data ?? []} viewsReady={views.isSuccess} />
    </div>
  );
}
