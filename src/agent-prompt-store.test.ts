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
  it('renews the retry key when another tab changes the composing weaver’s alias', () => {
    const storage = memoryStorage();
    const first = createAgentPromptStore(storage);
    const second = createAgentPromptStore(storage);
    first
      .getState()
      .open({ kind: 'card', cardId: 'card1', id: 'card1', title: 'Work' }, null, workspace);
    first.getState().edit('Please help');
    const submitted = first.getState().composer;
    if (submitted.kind !== 'composing') throw new Error('Expected an open composer');
    // A launch may already have been accepted, even if its response was lost.
    first.getState().track(workspace, 'accepted-run', submitted.requestId);
    second.getState().setAlias(workspace, 'astra');
    first.getState().refreshPreferences();
    const retry = first.getState().composer;
    if (retry.kind !== 'composing') throw new Error('Expected the draft to remain open');
    expect(retry.requestId).not.toBe(submitted.requestId);
    expect(retry.prompt).toBe('Please help');
    expect(first.getState().aliases[workspace]).toBe('astra');
    expect(first.getState().receipts[workspace]?.['accepted-run']?.requestId).toBe(
      submitted.requestId,
    );
  });
  it('keeps the retry key stable for unrelated preference and receipt refreshes', () => {
    const storage = memoryStorage();
    const first = createAgentPromptStore(storage);
    const second = createAgentPromptStore(storage);
    first
      .getState()
      .open({ kind: 'card', cardId: 'card1', id: 'card1', title: 'Work' }, null, workspace);
    first.getState().edit('Please help');
    const before = first.getState().composer;
    second.getState().setAlias(other, 'astra');
    second.getState().track(workspace, 'other-run', requestId);
    first.getState().refreshPreferences();
    first.getState().setAlias(other, 'sol');
    first.getState().setAlias(workspace, 'tui');
    expect(first.getState().composer).toEqual(before);
  });
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
