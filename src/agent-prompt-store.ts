import { create } from 'zustand';
import type { CommentPromptReference } from '../shared/api';
import {
  agentPreferenceKey,
  agentPreferencePrefix,
  readAgentPreferences,
  type AgentPreferences,
} from './lib/agent-preferences';

export type PromptTarget = {
  cardId: string;
  id: string;
  title: string;
} & (
  | { kind: 'card' }
  | { kind: 'review' }
  | { kind: 'review-comment'; comment: CommentPromptReference }
);
type Composer =
  | { kind: 'closed' }
  | {
      kind: 'composing';
      target: PromptTarget;
      workspace: string;
      trigger: HTMLElement | null;
      prompt: string;
      requestId: string;
    };

interface AgentPromptState extends AgentPreferences {
  persistenceError: string | null;
  refreshPreferences: () => void;
  track: (workspace: string, id: string, requestId: string) => void;
  markRead: (workspace: string, id: string) => void;
  composer: Composer;
  setAlias: (workspace: string, alias: string) => void;
  open: (target: PromptTarget, trigger: HTMLElement | null, workspace: string) => void;
  edit: (prompt: string) => void;
  close: () => void;
}

export function createAgentPromptStore(storage: Storage | null) {
  return create<AgentPromptState>()((set, get) => {
    function write(key: string, value: string) {
      try {
        if (!storage) throw new Error('Storage unavailable');
        storage.setItem(key, value);
        set({ persistenceError: null });
      } catch {
        set({
          persistenceError:
            'Browser storage is unavailable. Preferences and notifications are kept only for this session.',
        });
      }
    }
    let preferences: AgentPreferences = { aliases: {}, receipts: {} };
    try {
      preferences = readAgentPreferences(storage);
    } catch {
      /* Keep session state when storage is blocked. */
    }
    return {
      ...preferences,
      persistenceError: null,
      refreshPreferences: () => {
        try {
          const preferences = readAgentPreferences(storage);
          set((s) => ({
            ...preferences,
            composer:
              s.composer.kind === 'composing' &&
              (s.aliases[s.composer.workspace] ?? 'tui') !==
                (preferences.aliases[s.composer.workspace] ?? 'tui')
                ? { ...s.composer, requestId: newRequestId() }
                : s.composer,
          }));
        } catch {
          /* Retain the last successful preferences. */
        }
      },
      track: (workspace, id, requestId) => {
        write(agentPreferenceKey('receipt', workspace, id), requestId);
        let read = get().receipts[workspace]?.[id]?.read ?? false;
        try {
          read ||= storage?.getItem(agentPreferenceKey('read', workspace, id)) === requestId;
        } catch {
          /* Use session state. */
        }
        set((s) => ({
          receipts: {
            ...s.receipts,
            [workspace]: { ...s.receipts[workspace], [id]: { requestId, read } },
          },
        }));
      },
      markRead: (workspace, id) => {
        const receipt = get().receipts[workspace]?.[id];
        if (!receipt || receipt.read) return;
        write(agentPreferenceKey('read', workspace, id), receipt.requestId);
        set((s) => ({
          receipts: {
            ...s.receipts,
            [workspace]: { ...s.receipts[workspace], [id]: { ...receipt, read: true } },
          },
        }));
      },
      composer: { kind: 'closed' },
      setAlias: (workspace, alias) => {
        write(agentPreferenceKey('alias', workspace), alias);
        set((s) => ({
          aliases: { ...s.aliases, [workspace]: alias },
          composer:
            s.composer.kind === 'composing' &&
            s.composer.workspace === workspace &&
            (s.aliases[workspace] ?? 'tui') !== alias
              ? { ...s.composer, requestId: newRequestId() }
              : s.composer,
        }));
      },
      open: (target, trigger, workspace) =>
        set({
          composer: { kind: 'composing', target, workspace, trigger, prompt: '', requestId: '' },
        }),
      edit: (prompt) =>
        set((s) =>
          s.composer.kind === 'composing'
            ? { composer: { ...s.composer, prompt, requestId: newRequestId() } }
            : {},
        ),
      close: () => set({ composer: { kind: 'closed' } }),
    };
  });
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
export const useAgentPromptStore = createAgentPromptStore(browserStorage());
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith(agentPreferencePrefix))
      useAgentPromptStore.getState().refreshPreferences();
  });

function newRequestId(): string {
  // crypto.randomUUID is unavailable on ordinary HTTP LAN origins.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `ui-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
