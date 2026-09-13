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
      void navigate({ search: (old) => ({ ...old, workspace, issue: null }) });
    },
    openCard: (issue: string) => {
      useDashboardStore.getState().setDetailTab('overview');
      void navigate({ search: (old) => ({ ...old, issue }) });
    },
    closeCard: () => {
      void navigate({ search: (old) => ({ ...old, issue: null }) });
    },
    setMode: (mode: Presentation) => {
      void navigate({ search: (old) => ({ ...old, mode }) });
    },
    exploreGraph: (id: string) => {
      useDashboardStore.getState().setGraphRoot(id);
      void navigate({ search: (old) => ({ ...old, mode: 'graph', issue: null }) });
    },
  };
}

function hotkeys(key: string): string[] {
  const value = key.trim().toLowerCase();
  if (!value) return [];
  return [value === '?' ? 'shift+slash' : value.replaceAll('/', 'slash')];
}

export function useDashboardKeys() {
  const { setMode, issue } = useDashboardNavigation();
  const client = useQueryClient();
  const keys = useDashboardStore((s) => s.shortcuts);
  const overlay = useDashboardStore((s) => s.overlay.kind);
  const enabled = overlay === 'closed' && issue === null;
  useHotkeys(
    hotkeys(keys.search),
    () => {
      flushSync(() => useDashboardStore.getState().setContentFullscreen(false));
      document.getElementById('issue-search')?.focus();
    },
    { preventDefault: true, enabled },
    [keys.search, enabled],
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
