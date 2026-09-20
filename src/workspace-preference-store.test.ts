import { expect, it } from 'vitest';
import {
  createWorkspacePreferenceStore,
  workspacePreferencePrefix,
} from './workspace-preference-store';
import { hiddenWorkspaces } from './lib/workspaces';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  };
}
const one = { id: 'one', name: 'One', path: '/one/.millstrand' };
const two = { id: 'two', name: 'Two', path: '/two/.millstrand' };

it('persists pins and hides independently across tabs and reloads, with explicit restoration', () => {
  const storage = memoryStorage();
  const first = createWorkspacePreferenceStore(storage);
  const stale = createWorkspacePreferenceStore(storage);
  first.getState().setPreference(one, 'pinned');
  stale.getState().setPreference(two, 'hidden');
  first.getState().refresh();
  expect(first.getState().preferences).toEqual({
    one: { kind: 'pinned', name: one.name, path: one.path },
    two: { kind: 'hidden', name: two.name, path: two.path },
  });
  const reloaded = createWorkspacePreferenceStore(storage);
  expect(hiddenWorkspaces(reloaded.getState().preferences)).toEqual([two]);
  reloaded.getState().setPreference(two, null);
  reloaded.getState().setPreference(one, null);
  expect(createWorkspacePreferenceStore(storage).getState().preferences).toEqual({});
});

it('keeps session preferences and exposes unavailable or malformed storage', () => {
  const store = createWorkspacePreferenceStore(null, true);
  store.getState().setPreference(one, 'hidden');
  store.getState().refresh();
  expect(hiddenWorkspaces(store.getState().preferences)).toEqual([one]);
  expect(store.getState().persistenceError).toContain('only for this session');
  const storage = memoryStorage();
  storage.setItem(`${workspacePreferencePrefix}one`, JSON.stringify({ kind: 'invalid' }));
  expect(createWorkspacePreferenceStore(storage).getState().persistenceError).toContain(
    'could not',
  );
});
