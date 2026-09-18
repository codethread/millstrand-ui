import { create } from 'zustand';
import type { LogSource } from '../shared/log-activity';

type LogOverlay = { kind: 'closed' } | { kind: 'open'; identity: string; source: LogSource };
interface LogUiState {
  overlay: LogOverlay;
  view: 'conversation' | 'inspector' | 'console';
  paused: boolean;
  query: string;
  cardAgent: string | null;
  open: (identity: string, source: LogSource) => void;
  close: () => void;
  setView: (view: LogUiState['view']) => void;
  setPaused: (paused: boolean) => void;
  setQuery: (query: string) => void;
  setCardAgent: (cardAgent: string) => void;
}
export const useLogUiStore = create<LogUiState>((set) => ({
  overlay: { kind: 'closed' },
  view: 'inspector',
  paused: false,
  query: '',
  cardAgent: null,
  open: (identity, source) =>
    set({ overlay: { kind: 'open', identity, source }, paused: false, query: '' }),
  close: () => set({ overlay: { kind: 'closed' } }),
  setView: (view) => set({ view }),
  setPaused: (paused) => set({ paused }),
  setQuery: (query) => set({ query }),
  setCardAgent: (cardAgent) => set({ cardAgent }),
}));
