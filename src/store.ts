import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CardType, LabelTerm, Lane, Priority, SavedView, ViewFilter } from '../shared/api';
import { emptyFilter } from './lib/board';

export type Presentation = 'board' | 'outline' | 'graph';
export type DetailTab = 'overview' | 'activity' | 'attributes';
export type ShortcutAction = 'search' | 'board' | 'outline' | 'graph' | 'refresh' | 'help';
export const defaultShortcuts: Record<ShortcutAction, string> = {
  search: '/',
  board: '1',
  outline: '2',
  graph: '3',
  refresh: 'r',
  help: 'shift+/',
};
export const shortcutLabels: Record<ShortcutAction, string> = {
  search: 'Focus search',
  board: 'Board view',
  outline: 'Outline view',
  graph: 'Graph view',
  refresh: 'Refresh workspace',
  help: 'Keyboard shortcuts',
};
export type Overlay =
  | { kind: 'closed' }
  | { kind: 'shortcuts' }
  | { kind: 'view'; id: string | null; name: string; filter: ViewFilter };

interface DashboardState {
  filter: ViewFilter;
  activeViewId: string | null;
  overlay: Overlay;
  detailTab: DetailTab;
  graphRoot: string | null;
  sidebarOpen: boolean;
  shortcuts: Record<ShortcutAction, string>;
  setQuery: (query: string) => void;
  toggleClosed: () => void;
  toggleLane: (lane: Lane) => void;
  toggleType: (type: CardType) => void;
  togglePriority: (priority: Priority) => void;
  toggleLabel: (label: string) => void;
  resetFilters: () => void;
  resetWorkspace: () => void;
  selectView: (view: SavedView | null) => void;
  editView: (view: SavedView | null) => void;
  renameDraft: (name: string) => void;
  setDraftTerm: (label: string, term: LabelTerm | null) => void;
  setDraftMode: (mode: 'and' | 'or') => void;
  savedView: (view: SavedView) => void;
  closeOverlay: () => void;
  openShortcuts: () => void;
  setShortcut: (action: ShortcutAction, key: string) => void;
  resetShortcuts: () => void;
  setDetailTab: (tab: DetailTab) => void;
  setGraphRoot: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      filter: emptyFilter(),
      activeViewId: null,
      overlay: { kind: 'closed' },
      detailTab: 'overview',
      graphRoot: null,
      sidebarOpen: false,
      shortcuts: defaultShortcuts,
      setQuery: (query) => set((s) => ({ graphRoot: null, filter: { ...s.filter, query } })),
      toggleClosed: () =>
        set((s) => ({ filter: { ...s.filter, includeClosed: !s.filter.includeClosed } })),
      toggleLane: (lane) =>
        set((s) => ({
          graphRoot: null,
          filter: {
            ...s.filter,
            lanes: toggle(s.filter.lanes, lane),
            includeClosed: lane === 'closed' ? true : s.filter.includeClosed,
          },
        })),
      toggleType: (type) =>
        set((s) => ({
          graphRoot: null,
          filter: { ...s.filter, types: toggle(s.filter.types, type) },
        })),
      togglePriority: (priority) =>
        set((s) => ({
          graphRoot: null,
          filter: { ...s.filter, priorities: toggle(s.filter.priorities, priority) },
        })),
      toggleLabel: (label) =>
        set((s) => {
          const terms = { ...s.filter.terms };
          if (terms[label]) delete terms[label];
          else terms[label] = 'include';
          return { graphRoot: null, filter: { ...s.filter, terms } };
        }),
      resetWorkspace: () =>
        set({
          filter: emptyFilter(),
          activeViewId: null,
          graphRoot: null,
          overlay: { kind: 'closed' },
          sidebarOpen: false,
          detailTab: 'overview',
        }),
      resetFilters: () => set({ filter: emptyFilter(), activeViewId: null, graphRoot: null }),
      selectView: (view) =>
        set({
          filter: view ? structuredClone(view.filter) : emptyFilter(),
          activeViewId: view?.id ?? null,
          graphRoot: null,
          sidebarOpen: false,
        }),
      editView: (view) =>
        set((s) => ({
          sidebarOpen: false,
          overlay: {
            kind: 'view',
            id: view?.id ?? null,
            name: view?.name ?? '',
            filter: structuredClone(view?.filter ?? s.filter),
          },
        })),
      renameDraft: (name) =>
        set((s) => (s.overlay.kind === 'view' ? { overlay: { ...s.overlay, name } } : {})),
      setDraftTerm: (label, term) =>
        set((s) => {
          if (s.overlay.kind !== 'view') return {};
          const terms = { ...s.overlay.filter.terms };
          if (term === null) delete terms[label];
          else terms[label] = term;
          return { overlay: { ...s.overlay, filter: { ...s.overlay.filter, terms } } };
        }),
      setDraftMode: (mode) =>
        set((s) =>
          s.overlay.kind === 'view'
            ? { overlay: { ...s.overlay, filter: { ...s.overlay.filter, mode } } }
            : {},
        ),
      savedView: (view) =>
        set({
          overlay: { kind: 'closed' },
          activeViewId: view.id,
          graphRoot: null,
          filter: structuredClone(view.filter),
        }),
      closeOverlay: () => set({ overlay: { kind: 'closed' } }),
      openShortcuts: () => set({ overlay: { kind: 'shortcuts' }, sidebarOpen: false }),
      setShortcut: (action, key) => set((s) => ({ shortcuts: { ...s.shortcuts, [action]: key } })),
      resetShortcuts: () => set({ shortcuts: defaultShortcuts }),
      setDetailTab: (detailTab) => set({ detailTab }),
      setGraphRoot: (graphRoot) => set({ graphRoot }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    {
      name: 'millstrand-ui-preferences',
      partialize: (state) => ({ shortcuts: state.shortcuts }),
    },
  ),
);
