import { flushSync } from 'react-dom';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useHotkeys } from 'react-hotkeys-hook';
import { useDashboardStore, type Presentation } from '../store';

export function useDashboardNavigation() {
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  return {
    ...search,
    selectWorkspace: (workspace: string) => {
      useDashboardStore.getState().resetWorkspace();
      void navigate({ search: (old) => ({ ...old, workspace, issue: null, agent: null }) });
    },
    openCard: (issue: string) => {
      useDashboardStore.getState().setDetailTab('overview');
      void navigate({ search: (old) => ({ ...old, issue, agent: null }) });
    },
    openAgent: (agent: string) => {
      useDashboardStore.getState().setSidebarOpen(false);
      void navigate({ search: (old) => ({ ...old, agent, issue: null }) });
    },
    closeAgent: () => {
      void navigate({ search: (old) => ({ ...old, agent: null }) });
    },
    closeCard: () => {
      void navigate({ search: (old) => ({ ...old, issue: null }) });
    },
    setMode: (mode: Presentation) => {
      void navigate({ search: (old) => ({ ...old, mode }) });
    },
    exploreGraph: (id: string) => {
      useDashboardStore.getState().setGraphRoot(id);
      void navigate({ search: (old) => ({ ...old, mode: 'graph', issue: null, agent: null }) });
    },
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
  useHotkeys(
    hotkeys(keys.search),
    () => {
      flushSync(() => useDashboardStore.getState().setContentFullscreen(false));
      document.getElementById(mode === 'agents' ? 'agent-search' : 'issue-search')?.focus();
    },
    { preventDefault: true, enabled },
    [keys.search, enabled, mode],
  );
  useHotkeys(
    'escape',
    () => useDashboardStore.getState().setContentFullscreen(false),
    { enabled },
    [enabled],
  );
  useHotkeys(hotkeys(keys.board), () => setMode('board'), { enabled }, [keys.board, enabled]);
  useHotkeys(hotkeys(keys.outline), () => setMode('outline'), { enabled }, [keys.outline, enabled]);
  useHotkeys(hotkeys(keys.graph), () => setMode('graph'), { enabled }, [keys.graph, enabled]);
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
