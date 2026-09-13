import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LabelTerm, SavedView, ViewFilter } from '../shared/api';

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
  overlay: Overlay;
  sidebarOpen: boolean;
  contentFullscreen: boolean;
  setContentFullscreen: (fullscreen: boolean) => void;
  shortcuts: Record<ShortcutAction, string>;
  resetWorkspace: () => void;
  editView: (view: SavedView | null, filter: ViewFilter) => void;
  renameDraft: (name: string) => void;
  setDraftTerm: (label: string, term: LabelTerm | null) => void;
  setDraftMode: (mode: 'and' | 'or') => void;
  closeOverlay: () => void;
  openShortcuts: () => void;
  setShortcut: (action: ShortcutAction, key: string) => void;
  resetShortcuts: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      overlay: { kind: 'closed' },
      sidebarOpen: false,
      contentFullscreen: false,
      setContentFullscreen: (contentFullscreen) => set({ contentFullscreen, sidebarOpen: false }),
      shortcuts: defaultShortcuts,
      resetWorkspace: () => set({ overlay: { kind: 'closed' }, sidebarOpen: false }),
      editView: (view, filter) =>
        set({
          sidebarOpen: false,
          overlay: {
            kind: 'view',
            id: view?.id ?? null,
            name: view?.name ?? '',
            filter: structuredClone(view?.filter ?? filter),
          },
        }),
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
      closeOverlay: () => set({ overlay: { kind: 'closed' } }),
      openShortcuts: () => set({ overlay: { kind: 'shortcuts' }, sidebarOpen: false }),
      setShortcut: (action, key) => set((s) => ({ shortcuts: { ...s.shortcuts, [action]: key } })),
      resetShortcuts: () => set({ shortcuts: defaultShortcuts }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    {
      name: 'millstrand-ui-preferences',
      partialize: (state) => ({ shortcuts: state.shortcuts }),
    },
  ),
);
