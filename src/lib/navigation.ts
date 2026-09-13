import { flushSync } from 'react-dom';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useHotkeys } from 'react-hotkeys-hook';
import { useDashboardStore } from '../store';
import type { CardType, Lane, Priority, SavedView, ViewFilter } from '../../shared/api';
import { emptyFilter, workspaceFilter, type WorkspaceView } from './board';
import {
  manualFilterSearch,
  workspaceDestination,
  type DashboardSearch,
  type DetailTab,
  type Presentation,
} from './dashboard-search';

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function useDashboardNavigation() {
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  function update(change: Partial<DashboardSearch>, replace = false) {
    void navigate({ search: (old) => ({ ...old, ...change }), replace });
  }
  function filter(change: (current: ViewFilter) => ViewFilter, replace = false) {
    update(manualFilterSearch(search, change(search.filter)), replace);
  }
  function selectView(view: SavedView | null) {
    useDashboardStore.getState().setSidebarOpen(false);
    update({
      filter: view?.filter ?? emptyFilter(),
      activeViewId: view?.id ?? null,
      graphRoot: null,
      mode: search.mode === 'agents' || search.mode === 'overview' ? 'board' : search.mode,
    });
  }
  return {
    ...search,
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
      update({ agent, issue: null });
    },
    closeAgent: () => update({ agent: null }),
    closeCard: () => update({ issue: null }),
    setMode: (mode: Presentation) => update({ mode }),
    exploreGraph: (graphRoot: string) =>
      update({ graphRoot, mode: 'graph', issue: null, agent: null }),
    setGraphRoot: (graphRoot: string | null) => update({ graphRoot }),
    setDetailTab: (detailTab: DetailTab) => update({ detailTab }),
    setAgentQuery: (agentQuery: string) => update({ agentQuery }, true),
    resetAgentFilters: () => update({ agentQuery: '', activeAgentsOnly: false }),
    toggleActiveAgents: () => update({ activeAgentsOnly: !search.activeAgentsOnly }),
    setQuery: (query: string) => filter((f) => ({ ...f, query }), true),
    toggleClosed: () => filter((f) => ({ ...f, includeClosed: !f.includeClosed })),
    toggleLane: (lane: Lane) =>
      filter((f) => ({
        ...f,
        lanes: toggle(f.lanes, lane),
        includeClosed: lane === 'closed' ? true : f.includeClosed,
      })),
    toggleType: (type: CardType) => filter((f) => ({ ...f, types: toggle(f.types, type) })),
    togglePriority: (priority: Priority) =>
      filter((f) => ({ ...f, priorities: toggle(f.priorities, priority) })),
    toggleLabel: (label: string) =>
      filter((f) => {
        const terms = { ...f.terms };
        if (terms[label]) delete terms[label];
        else terms[label] = 'include';
        return { ...f, terms };
      }),
    resetFilters: () => update({ filter: emptyFilter(), activeViewId: null, graphRoot: null }),
    selectWorkspaceView: (view: WorkspaceView) => {
      useDashboardStore.getState().setSidebarOpen(false);
      update({
        filter: workspaceFilter(view),
        activeViewId: null,
        graphRoot: null,
        mode: search.mode === 'agents' ? 'board' : search.mode,
      });
    },
    selectView,
    editView: (view: SavedView | null) =>
      useDashboardStore.getState().editView(view, search.filter),
  };
}

function hotkeys(key: string): string[] {
  const value = key.trim().toLowerCase();
  if (!value) return [];
  return [value === '?' ? 'shift+slash' : value.replaceAll('/', 'slash')];
}

export function useDashboardKeys() {
  const { setMode, issue, agent, mode } = useDashboardNavigation();
  const client = useQueryClient();
  const keys = useDashboardStore((s) => s.shortcuts);
  const overlay = useDashboardStore((s) => s.overlay.kind);
  const enabled = overlay === 'closed' && issue === null && agent === null;
  const workspaceEnabled = enabled && mode !== 'overview';
  useHotkeys(
    hotkeys(keys.search),
    () => {
      flushSync(() => useDashboardStore.getState().setContentFullscreen(false));
      document.getElementById(mode === 'agents' ? 'agent-search' : 'issue-search')?.focus();
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
