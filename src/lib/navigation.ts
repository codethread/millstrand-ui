import type { ReviewScope, ReviewStage } from '../../shared/reviews';
import { flushSync } from 'react-dom';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useHotkeys } from 'react-hotkeys-hook';
import { useDashboardStore } from '../store';
import { useAgentPromptStore } from '../agent-prompt-store';
import type { CardType, Lane, Priority, SavedView, ViewFilter } from '../../shared/api';
import { emptyFilter, type WorkspaceView } from './board';
import {
  manualFilterSearch,
  parseDashboardSearch,
  savedViewSearch,
  workspaceDestination,
  workspaceViewSearch,
  type DashboardSearch,
  type DetailTab,
  type Presentation,
} from './dashboard-search';

const selectMode = (search: DashboardSearch) => search.mode;
const selectWorkspace = (search: DashboardSearch) => search.workspace;
const selectIssue = (search: DashboardSearch) => search.issue;
const selectAgent = (search: DashboardSearch) => search.agent;
const selectAgentRun = (search: DashboardSearch) => search.agentRun;
const selectReview = (search: DashboardSearch) => search.review;
const selectReviewQuery = (search: DashboardSearch) => search.reviewQuery;
const selectReviewScope = (search: DashboardSearch) => search.reviewScope;
const selectReviewStage = (search: DashboardSearch) => search.reviewStage;
const selectFilter = (search: DashboardSearch) => search.filter;
const selectActiveViewId = (search: DashboardSearch) => search.activeViewId;
const selectGraphRoot = (search: DashboardSearch) => search.graphRoot;
const selectDetailTab = (search: DashboardSearch) => search.detailTab;
const selectAgentQuery = (search: DashboardSearch) => search.agentQuery;
const selectActiveAgentsOnly = (search: DashboardSearch) => search.activeAgentsOnly;

export function useDashboardMode() {
  return useSearch({ from: '/', select: selectMode });
}
export function useWorkspaceId() {
  return useSearch({ from: '/', select: selectWorkspace });
}
export function useSelectedIssue() {
  return useSearch({ from: '/', select: selectIssue });
}
export function useSelectedAgent() {
  return useSearch({ from: '/', select: selectAgent });
}
export function useSelectedAgentRun() {
  return useSearch({ from: '/', select: selectAgentRun });
}
export function useSelectedReview() {
  return useSearch({ from: '/', select: selectReview });
}
export function useReviewQuery() {
  return useSearch({ from: '/', select: selectReviewQuery });
}
export function useReviewScope() {
  return useSearch({ from: '/', select: selectReviewScope });
}
export function useReviewStage() {
  return useSearch({ from: '/', select: selectReviewStage });
}
export function useIssueFilter() {
  return useSearch({ from: '/', select: selectFilter });
}
export function useActiveViewId() {
  return useSearch({ from: '/', select: selectActiveViewId });
}
export function useGraphRoot() {
  return useSearch({ from: '/', select: selectGraphRoot });
}
export function useDetailTab() {
  return useSearch({ from: '/', select: selectDetailTab });
}
export function useAgentQuery() {
  return useSearch({ from: '/', select: selectAgentQuery });
}
export function useActiveAgentsOnly() {
  return useSearch({ from: '/', select: selectActiveAgentsOnly });
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** Navigation commands never subscribe to URL state. Every state-dependent command
 * derives its next value from the Router callback's current search snapshot. */
export function useDashboardActions() {
  const navigate = useNavigate({ from: '/' });
  function update(change: Partial<DashboardSearch>, replace = false) {
    void navigate({ search: (current) => ({ ...current, ...change }), replace });
  }
  function updateCurrent(
    change: (current: DashboardSearch) => Partial<DashboardSearch>,
    replace = false,
  ) {
    void navigate({
      search: (current) => {
        const search = parseDashboardSearch(current);
        return { ...search, ...change(search) };
      },
      replace,
    });
  }
  function filter(change: (current: ViewFilter) => ViewFilter, replace = false) {
    updateCurrent((current) => manualFilterSearch(current, change(current.filter)), replace);
  }
  return {
    openReview: (review: string) => update({ mode: 'reviews', review, issue: null, agent: null }),
    closeReview: () => update({ review: null }),
    setReviewQuery: (reviewQuery: string) => update({ reviewQuery }, true),
    setReviewScope: (reviewScope: ReviewScope) => update({ reviewScope }),
    setReviewStage: (reviewStage: ReviewStage | null) => update({ reviewStage }),
    pinWorkspace: (workspace: string) => update({ workspace }, true),
    selectWorkspace: (workspace: string) => {
      useDashboardStore.getState().resetWorkspace();
      void navigate({ search: workspaceDestination(workspace, { kind: 'board' }) });
    },
    openOverview: () => {
      useDashboardStore.getState().resetWorkspace();
      update({ mode: 'overview', issue: null, agent: null });
    },
    openCard: (issue: string) => update({ issue, agent: null, detailTab: 'overview' }),
    openAgent: (agent: string) => {
      useDashboardStore.getState().setSidebarOpen(false);
      update({ agent, agentRun: null, issue: null });
    },
    openAgentRun: (identity: string | null, runId: string) => {
      useDashboardStore.getState().setSidebarOpen(false);
      update({
        mode: 'agents',
        agent: identity,
        agentRun: runId,
        issue: null,
        agentQuery: '',
        activeAgentsOnly: false,
      });
    },
    focusAgentRun: (agentRun: string) => update({ agentRun }, true),
    closeAgent: () => update({ agent: null }),
    closeCard: () => update({ issue: null }),
    openAgents: () => update({ mode: 'agents', issue: null, agent: null, activeAgentsOnly: true }),
    setMode: (mode: Presentation) => update({ mode, issue: null, agent: null }),
    exploreGraph: (graphRoot: string) =>
      update({ graphRoot, mode: 'graph', issue: null, agent: null }),
    setGraphRoot: (graphRoot: string | null) => update({ graphRoot }),
    setDetailTab: (detailTab: DetailTab) => update({ detailTab }),
    setAgentQuery: (agentQuery: string) => update({ agentQuery }, true),
    resetAgentFilters: () => update({ agentQuery: '', activeAgentsOnly: false }),
    toggleActiveAgents: () =>
      updateCurrent((current) => ({ activeAgentsOnly: !current.activeAgentsOnly })),
    setQuery: (query: string) => filter((current) => ({ ...current, query }), true),
    toggleClosed: () =>
      filter((current) => ({ ...current, includeClosed: !current.includeClosed })),
    toggleLane: (lane: Lane) =>
      filter((current) => ({
        ...current,
        lanes: toggle(current.lanes, lane),
        includeClosed: lane === 'closed' ? true : current.includeClosed,
      })),
    toggleType: (type: CardType) =>
      filter((current) => ({ ...current, types: toggle(current.types, type) })),
    togglePriority: (priority: Priority) =>
      filter((current) => ({ ...current, priorities: toggle(current.priorities, priority) })),
    toggleLabel: (label: string) =>
      filter((current) => {
        const terms = { ...current.terms };
        if (terms[label]) delete terms[label];
        else terms[label] = 'include';
        return { ...current, terms };
      }),
    resetFilters: () => update({ filter: emptyFilter(), activeViewId: null, graphRoot: null }),
    selectWorkspaceView: (view: WorkspaceView) => {
      useDashboardStore.getState().setSidebarOpen(false);
      updateCurrent((current) => workspaceViewSearch(current, view));
    },
    selectView: (view: SavedView | null) => {
      useDashboardStore.getState().setSidebarOpen(false);
      updateCurrent((current) => savedViewSearch(current, view));
    },
    editView: (view: SavedView | null, snapshot: ViewFilter) =>
      useDashboardStore.getState().editView(view, snapshot),
  };
}

function hotkeys(key: string): string[] {
  const value = key.trim().toLowerCase();
  if (!value) return [];
  return [value === '?' ? 'shift+slash' : value.replaceAll('/', 'slash')];
}

export function useDashboardKeys() {
  const { setMode } = useDashboardActions();
  const issue = useSelectedIssue();
  const agent = useSelectedAgent();
  const mode = useDashboardMode();
  const client = useQueryClient();
  const keys = useDashboardStore((state) => state.shortcuts);
  const overlay = useDashboardStore((state) => state.overlay.kind);
  const composer = useAgentPromptStore((state) => state.composer.kind);
  const enabled = overlay === 'closed' && composer === 'closed' && issue === null && agent === null;
  const workspaceEnabled = enabled && mode !== 'overview';
  useHotkeys(
    hotkeys(keys.search),
    () => {
      flushSync(() => useDashboardStore.getState().setContentFullscreen(false));
      document
        .getElementById(
          mode === 'agents'
            ? 'agent-search'
            : mode === 'reviews'
              ? 'review-search'
              : 'issue-search',
        )
        ?.focus();
    },
    { preventDefault: true, enabled: workspaceEnabled },
    [keys.search, workspaceEnabled, mode],
  );
  useHotkeys(
    'escape',
    () => useDashboardStore.getState().setContentFullscreen(false),
    { enabled },
    [enabled],
  );
  useHotkeys(hotkeys(keys.board), () => setMode('board'), { enabled: workspaceEnabled }, [
    keys.board,
    workspaceEnabled,
  ]);
  useHotkeys(hotkeys(keys.outline), () => setMode('outline'), { enabled: workspaceEnabled }, [
    keys.outline,
    workspaceEnabled,
  ]);
  useHotkeys(hotkeys(keys.graph), () => setMode('graph'), { enabled: workspaceEnabled }, [
    keys.graph,
    workspaceEnabled,
  ]);
  useHotkeys(
    hotkeys(keys.refresh),
    () => {
      void client.invalidateQueries();
    },
    { enabled },
    [keys.refresh, enabled],
  );
  useHotkeys(
    hotkeys(keys.help),
    () => useDashboardStore.getState().openShortcuts(),
    { preventDefault: true, enabled },
    [keys.help, enabled],
  );
}
