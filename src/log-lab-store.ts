import { create } from 'zustand';

interface LabState {
  query: string;
  provider: string;
  sessionQuery: string;
  kind: string;
  paused: boolean;
  follow: boolean;
  inspected: string | null;
  setQuery: (value: string) => void;
  setProvider: (value: string) => void;
  setSessionQuery: (value: string) => void;
  setKind: (value: string) => void;
  setPaused: (value: boolean) => void;
  setFollow: (value: boolean) => void;
  setInspected: (value: string) => void;
}
export const useLabStore = create<LabState>((set) => ({
  query: '',
  provider: 'all',
  sessionQuery: '',
  kind: 'all',
  paused: false,
  follow: true,
  inspected: null,
  setQuery: (query) => set({ query }),
  setProvider: (provider) => set({ provider }),
  setSessionQuery: (sessionQuery) => set({ sessionQuery }),
  setKind: (kind) => set({ kind }),
  setPaused: (paused) => set({ paused }),
  setFollow: (follow) => set({ follow }),
  setInspected: (inspected) => set({ inspected }),
}));
