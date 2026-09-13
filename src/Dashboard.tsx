import { lazy, Suspense, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Filter,
  GitBranch,
  Keyboard,
  LayoutGrid,
  ListTree,
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
import { boardSummary, emptyFilter, lanes, selectCards, viewDescription } from './lib/board';
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
}

function SidebarContents({ board, views, connected }: SidebarProps) {
  const s = useDashboardStore();
  const active = boardSummary(board);
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
      <button
        className={cn('nav-item', s.activeViewId === null && 'active')}
        onClick={() => s.selectView(null)}
      >
        <LayoutGrid />
        All issues<span className="nav-count">{active.active}</span>
      </button>
      <button
        className="nav-item"
        onClick={() => {
          s.selectView(null);
          s.toggleLane('claimed');
        }}
      >
        <Activity />
        Active work<span className="nav-count">{active.inProgress}</span>
      </button>
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
        <div className="local-workspace-note">
          <span className="live-dot" />
          <span>
            {connected ? 'Connected to your workspace' : 'Connection interrupted'}
            <small>Labels & views are editable</small>
          </span>
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
  const client = useQueryClient();
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
  const summary = boardSummary(data);
  const selectedView = views.data?.find((view) => view.id === s.activeViewId);
  const isFiltered = JSON.stringify(s.filter) !== JSON.stringify(emptyFilter());
  return (
    <div className="app-shell">
      <Sidebar board={data} views={views.data ?? []} connected={!board.error} />
      <main className="main-workspace">
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              className="md:hidden"
              variant="ghost"
              size="icon-sm"
              aria-label="Open navigation"
              onClick={() => s.setSidebarOpen(true)}
            >
              <Menu />
            </Button>
            <span className="breadcrumb-project">{data.workspace.name}</span>
            <ChevronRight className="size-3 text-muted-foreground" />
            <span className="text-foreground">Overview</span>
          </div>
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn('sync-indicator', board.error && 'disconnected')}>
                  <span className="live-dot" />
                  {board.error ? 'Disconnected' : 'Live'}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Refreshes every 5 seconds · last update{' '}
                {new Date(data.fetchedAt).toLocaleTimeString()}
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
              <RefreshCw className={cn(board.isFetching && 'animate-spin')} />
            </Button>
          </div>
        </header>
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">
              <span className="size-1.5 rounded-full bg-primary" />
              YOUR WORK, CONNECTED
            </div>
            <h1>{selectedView?.name ?? 'All issues'}</h1>
            <p>
              {selectedView
                ? viewDescription(selectedView)
                : 'A little perspective on everything in motion.'}
            </p>
          </div>
          <Button
            variant="outline"
            className="save-view-button"
            onClick={() => s.editView(selectedView ? { ...selectedView, filter: s.filter } : null)}
          >
            <Bookmark />
            {selectedView ? 'Edit view' : 'Save view'}
          </Button>
        </div>
        <div className="summary-strip">
          <button onClick={() => s.selectView(null)}>
            <span className="summary-icon active">
              <LayersIcon />
            </span>
            <div>
              <span>Active issues</span>
              <strong>{summary.active}</strong>
            </div>
          </button>
          <button
            onClick={() => {
              s.selectView(null);
              s.toggleLane('claimed');
            }}
          >
            <span className="summary-icon progress">
              <CircleDot />
            </span>
            <div>
              <span>In progress</span>
              <strong>{summary.inProgress}</strong>
            </div>
            <span className="summary-caption">Moving forward</span>
          </button>
          <button
            onClick={() => {
              s.selectView(null);
              s.toggleLane('in_review');
            }}
          >
            <span className="summary-icon review">
              <Sparkles />
            </span>
            <div>
              <span>In review</span>
              <strong>{summary.review}</strong>
            </div>
          </button>
          <button
            onClick={() => {
              s.selectView(null);
              s.toggleClosed();
              s.toggleLane('closed');
            }}
          >
            <span className="summary-icon done">
              <Check />
            </span>
            <div>
              <span>Completed</span>
              <strong>{summary.closed}</strong>
            </div>
          </button>
        </div>
        <div className="view-toolbar">
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
            {s.filter.includeClosed ? 'All activity' : 'Active work'}
            {nav.mode === 'board' && (
              <>
                <span className="context-dot">·</span>Grouped by status
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
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
        </div>
        {board.error && <ErrorNotice error={board.error} />}
        {views.error && <ErrorNotice error={views.error} />}
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
        <footer className="workspace-footer">
          <span>
            <span className="live-dot" />
            Millstrand workspace
          </span>
          <span>
            Board <kbd>{s.shortcuts.board}</kbd> Outline <kbd>{s.shortcuts.outline}</kbd> Graph{' '}
            <kbd>{s.shortcuts.graph}</kbd>
            <span className="footer-divider" />
            Shortcuts{' '}
            <button onClick={s.openShortcuts}>
              <kbd>?</kbd>
            </button>
          </span>
        </footer>
      </main>
      {nav.issue && <IssueDetail key={nav.issue} id={nav.issue} />}
      <DashboardOverlays board={data} views={views.data ?? []} viewsReady={views.isSuccess} />
    </div>
  );
}

function LayersIcon() {
  return <LayoutGrid />;
}
