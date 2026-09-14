import { describe, expect, it } from 'vitest';
import { createAgentPromptStore } from './agent-prompt-store';
import { agentPreferenceKey, readAgentPreferences } from './lib/agent-preferences';

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
const workspace = 'a'.repeat(24);
const other = 'b'.repeat(24);
const requestId = 'ui-0123456789abcdef';

describe('independent browser preference keys', () => {
  it('does not let a stale tab or transient composer actions overwrite receipts and aliases', () => {
    const storage = memoryStorage();
    const first = createAgentPromptStore(storage);
    const stale = createAgentPromptStore(storage);
    first.getState().track(workspace, 'run1', requestId);
    first.getState().setAlias(workspace, 'tui');
    stale.getState().setAlias(other, 'astra');
    stale.getState().close();
    expect(readAgentPreferences(storage)).toEqual({
      aliases: { [workspace]: 'tui', [other]: 'astra' },
      receipts: { [workspace]: { run1: { requestId, read: false } } },
    });
    stale.getState().refreshPreferences();
    expect(stale.getState().receipts).toEqual(first.getState().receipts);
  });
  it('retains read markers across stale-tab retries, unrelated launches, and reload', () => {
    const storage = memoryStorage();
    const first = createAgentPromptStore(storage);
    const stale = createAgentPromptStore(storage);
    first.getState().track(workspace, 'run1', requestId);
    first.getState().markRead(workspace, 'run1');
    stale.getState().track(workspace, 'run1', requestId);
    stale.getState().track(other, 'run1', 'ui-differentrequest');
    expect(createAgentPromptStore(storage).getState().receipts).toEqual({
      [workspace]: { run1: { requestId, read: true } },
      [other]: { run1: { requestId: 'ui-differentrequest', read: false } },
    });
  });
  it('rejects malformed storage and only applies read markers to their matching request', () => {
    const storage = memoryStorage();
    storage.setItem(agentPreferenceKey('alias', workspace), '--interactive');
    storage.setItem(agentPreferenceKey('receipt', workspace, 'bad'), 'terminal-request');
    storage.setItem(agentPreferenceKey('receipt', workspace, 'good'), requestId);
    storage.setItem(agentPreferenceKey('read', workspace, 'good'), 'ui-unrelatedrequest');
    storage.setItem('millstrand-ui-agent:alias:/arbitrary/path', 'tui');
    expect(readAgentPreferences(storage)).toEqual({
      aliases: {},
      receipts: { [workspace]: { good: { requestId, read: false } } },
    });
  });
  it('retains session tracking and explains persistence failures instead of failing a launch', () => {
    const store = createAgentPromptStore(null);
    store.getState().track(workspace, 'run1', requestId);
    expect(store.getState().receipts[workspace]?.['run1']?.requestId).toBe(requestId);
    expect(store.getState().persistenceError).toContain('only for this session');
  });
});
