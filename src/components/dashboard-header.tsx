import {
  Bookmark,
  Bot,
  Check,
  GitPullRequest,
  LayoutGrid,
  ListTree,
  Menu,
  Network,
  Search,
  X,
} from 'lucide-react';
import { useFilteredCardCount } from '../hooks/use-cards';
import { useSavedViews } from '../hooks/use-views';
import { emptyFilter } from '../lib/board';
import type { Presentation } from '../lib/dashboard-search';
import {
  useActiveViewId,
  useDashboardActions,
  useDashboardMode,
  useIssueFilter,
} from '../lib/navigation';
import { cn } from '../lib/utils';
import { useDashboardStore } from '../store';
import { AgentNotifications } from './agent-notifications';
import { AgentSearchControls } from './agent-directory';
import { DashboardFilters } from './dashboard-filters';
import { ReviewSearchControls } from './review-inbox';
import { Button } from './ui/button';
import { Input } from './ui/input';

const modes = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'graph', label: 'Graph', icon: Network },
] satisfies { id: Presentation; label: string; icon: typeof LayoutGrid }[];

export function DashboardHeader() {
  const mode = useDashboardMode();
  const filter = useIssueFilter();
  const activeViewId = useActiveViewId();
  const actions = useDashboardActions();
  const cardCount = useFilteredCardCount(filter);
  const views = useSavedViews();
  const searchShortcut = useDashboardStore((state) => state.shortcuts.search);
  const setSidebarOpen = useDashboardStore((state) => state.setSidebarOpen);
  const selectedView = views.data?.find((view) => view.id === activeViewId);
  const isFiltered = JSON.stringify(filter) !== JSON.stringify(emptyFilter());
  return (
    <header className="workspace-header">
      <div className="view-toolbar">
        <Button
          className="md:hidden"
          variant="ghost"
          size="icon-sm"
          aria-label="Open navigation"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu />
        </Button>
        {mode === 'completed' ? (
          <h1 className="flex h-[38px] items-center gap-2 text-sm! tracking-normal!">
            <Check className="size-4 text-primary" />
            Completed work
          </h1>
        ) : mode === 'reviews' ? (
          <h1 className="flex h-[38px] items-center gap-2 text-sm! tracking-normal!">
            <GitPullRequest className="size-4 text-primary" />
            Reviews
          </h1>
        ) : mode === 'agents' ? (
          <h1 className="flex h-[38px] items-center gap-2 text-sm! tracking-normal!">
            <Bot className="size-4 text-primary" />
            Agents
          </h1>
        ) : (
          <div className="view-tabs" aria-label="View layout">
            {modes.map(({ id, label, icon: Icon }) => (
              <button
                aria-pressed={mode === id}
                className={cn(mode === id && 'selected')}
                key={id}
                onClick={() => actions.setMode(id)}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>
        )}
        <AgentNotifications />
        {mode === 'completed' ? null : mode === 'reviews' ? (
          <ReviewSearchControls />
        ) : mode === 'agents' ? (
          <AgentSearchControls />
        ) : (
          <div className="toolbar-actions">
            <div className="search-field">
              <Search />
              <Input
                id="issue-search"
                aria-label="Search issues"
                placeholder="Search issues…"
                value={filter.query}
                onChange={(event) => actions.setQuery(event.target.value)}
              />
              {filter.query ? (
                <button aria-label="Clear search" onClick={() => actions.setQuery('')}>
                  <X className="size-3" />
                </button>
              ) : (
                <kbd>{searchShortcut}</kbd>
              )}
            </div>
            <DashboardFilters />
            <button
              className={cn('closed-toggle', filter.includeClosed && 'selected')}
              onClick={actions.toggleClosed}
              aria-pressed={filter.includeClosed}
            >
              <Check className="size-3.5" />
              Include completed
            </button>
          </div>
        )}
      </div>
      {mode !== 'agents' && mode !== 'reviews' && mode !== 'completed' && (
        <div className="view-context">
          <span>
            {cardCount.data ?? 0} {cardCount.data === 1 ? 'issue' : 'issues'}
            <span className="context-dot">·</span>
            {selectedView?.name ?? (filter.includeClosed ? 'All activity' : 'Active work')}
            {mode === 'board' && (
              <>
                <span className="context-dot">·</span>Grouped by status
              </>
            )}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(filter.terms).map(([label, term]) => (
              <button
                key={label}
                className="active-filter"
                onClick={() => actions.toggleLabel(label)}
              >
                {term === 'exclude' ? '−' : '#'}
                {label}
                <X className="size-3" />
              </button>
            ))}
            {isFiltered && (
              <button className="reset-filters" onClick={actions.resetFilters}>
                Clear filters
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="save-view-button ml-auto"
            onClick={() =>
              actions.editView(selectedView ? { ...selectedView, filter } : null, filter)
            }
          >
            <Bookmark />
            {selectedView ? 'Edit view' : 'Save view'}
          </Button>
        </div>
      )}
    </header>
  );
}
