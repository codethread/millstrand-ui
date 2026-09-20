import { create } from 'zustand';
import type { WeaverOperation } from '../shared/api';

export type CockpitSection = 'all' | 'attention' | 'review' | 'quiet';
export type WeaverControl =
  | { kind: 'closed' }
  | { kind: 'fleet' }
  | { kind: 'confirm'; workspace: string; operation: WeaverOperation };

interface CockpitState {
  search: string;
  scope: string | null;
  section: CockpitSection;
  controls: WeaverControl;
  setSearch: (search: string) => void;
  setScope: (scope: string | null) => void;
  setSection: (section: CockpitSection) => void;
  setControls: (controls: WeaverControl) => void;
}

export const useCockpitStore = create<CockpitState>()((set) => ({
  search: '',
  scope: null,
  section: 'all',
  controls: { kind: 'closed' },
  setSearch: (search) => set({ search }),
  setScope: (scope) => set({ scope }),
  setSection: (section) => set({ section }),
  setControls: (controls) => set({ controls }),
}));
