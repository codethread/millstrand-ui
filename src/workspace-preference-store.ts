import { create } from 'zustand';
import { z } from 'zod';
import type { WorkspaceOption } from '../shared/api';
import type { WorkspacePreference, WorkspacePreferences } from './lib/workspaces';

export const workspacePreferencePrefix = 'millstrand-ui-weaver:';
const preferenceSchema = z.object({
  kind: z.enum(['pinned', 'hidden']),
  name: z.string(),
  path: z.string(),
});
const persistenceFailure =
  'Weaver preferences could not be saved or loaded. Changes are kept only for this session.';

interface WorkspacePreferenceState {
  preferences: WorkspacePreferences;
  persistenceError: string | null;
  setPreference: (
    workspace: Pick<WorkspaceOption, 'id' | 'name' | 'path'>,
    kind: WorkspacePreference['kind'] | null,
  ) => void;
  refresh: () => void;
}

export function createWorkspacePreferenceStore(storage: Storage | null, accessFailed = false) {
  return create<WorkspacePreferenceState>()((set) => {
    function read(): WorkspacePreferences {
      const preferences: WorkspacePreferences = {};
      if (!storage) return preferences;
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(workspacePreferencePrefix)) continue;
        const value = storage.getItem(key);
        if (value !== null)
          preferences[key.slice(workspacePreferencePrefix.length)] = preferenceSchema.parse(
            JSON.parse(value) as unknown,
          );
      }
      return preferences;
    }
    let preferences: WorkspacePreferences = {};
    let persistenceError = accessFailed ? persistenceFailure : null;
    try {
      preferences = read();
    } catch {
      persistenceError = persistenceFailure;
    }
    return {
      preferences,
      persistenceError,
      setPreference: (workspace, kind) => {
        const preference =
          kind === null ? null : { kind, name: workspace.name, path: workspace.path };
        let error: string | null = null;
        try {
          if (!storage) throw new Error('Storage unavailable');
          const key = `${workspacePreferencePrefix}${workspace.id}`;
          if (preference) storage.setItem(key, JSON.stringify(preference));
          else storage.removeItem(key);
        } catch {
          error = persistenceFailure;
        }
        set((state) => {
          const next = { ...state.preferences };
          if (preference) next[workspace.id] = preference;
          else delete next[workspace.id];
          return { preferences: next, persistenceError: error };
        });
      },
      refresh: () => {
        try {
          if (!storage) throw new Error('Storage unavailable');
          set({ preferences: read(), persistenceError: null });
        } catch {
          set({ persistenceError: persistenceFailure });
        }
      },
    };
  });
}

function browserStore() {
  try {
    return createWorkspacePreferenceStore(
      typeof window === 'undefined' ? null : window.localStorage,
    );
  } catch {
    return createWorkspacePreferenceStore(null, true);
  }
}
export const useWorkspacePreferenceStore = browserStore();
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith(workspacePreferencePrefix))
      useWorkspacePreferenceStore.getState().refresh();
  });
