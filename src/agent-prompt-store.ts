import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { parseAgentPreferences } from './lib/agent-preferences';
import { parsePromptReceipts, type PromptReceipts } from './lib/agent-notifications';

export interface PromptTarget {
  cardId: string;
  id: string;
  title: string;
}

type Composer =
  | { kind: 'closed' }
  | {
      kind: 'composing';
      target: PromptTarget;
      trigger: HTMLElement;
      prompt: string;
      requestId: string;
    };

interface AgentPromptState {
  aliases: Record<string, string>;
  receipts: PromptReceipts;
  track: (workspace: string, id: string, requestId: string) => void;
  markRead: (workspace: string, id: string) => void;
  composer: Composer;
  setAlias: (workspace: string, alias: string) => void;
  open: (target: PromptTarget, trigger: HTMLElement) => void;
  edit: (prompt: string) => void;
  close: () => void;
}

export const useAgentPromptStore = create<AgentPromptState>()(
  persist(
    (set) => ({
      aliases: {},
      receipts: {},
      track: (workspace, id, requestId) =>
        set((s) => ({
          receipts: {
            ...s.receipts,
            [workspace]: Object.fromEntries(
              Object.entries({ ...s.receipts[workspace], [id]: { requestId, read: false } }).slice(
                -200,
              ),
            ),
          },
        })),
      markRead: (workspace, id) =>
        set((s) => {
          const receipt = s.receipts[workspace]?.[id];
          return !receipt || receipt.read
            ? {}
            : {
                receipts: {
                  ...s.receipts,
                  [workspace]: { ...s.receipts[workspace], [id]: { ...receipt, read: true } },
                },
              };
        }),
      composer: { kind: 'closed' },
      setAlias: (workspace, alias) =>
        set((s) => ({
          aliases: { ...s.aliases, [workspace]: alias },
          composer:
            s.composer.kind === 'composing'
              ? { ...s.composer, requestId: newRequestId() }
              : s.composer,
        })),
      open: (target, trigger) =>
        set({ composer: { kind: 'composing', target, trigger, prompt: '', requestId: '' } }),
      edit: (prompt) =>
        set((s) =>
          s.composer.kind === 'composing'
            ? { composer: { ...s.composer, prompt, requestId: newRequestId() } }
            : {},
        ),
      close: () => set({ composer: { kind: 'closed' } }),
    }),
    {
      name: 'millstrand-ui-agent-preferences',
      partialize: (state) => ({ aliases: state.aliases, receipts: state.receipts }),
      merge: (persisted, current) => ({
        ...current,
        aliases: parseAgentPreferences(
          typeof persisted === 'object' && persisted !== null && 'aliases' in persisted
            ? persisted.aliases
            : null,
        ),
        receipts: parsePromptReceipts(
          typeof persisted === 'object' && persisted !== null && 'receipts' in persisted
            ? persisted.receipts
            : null,
        ),
      }),
    },
  ),
);

function newRequestId(): string {
  // crypto.randomUUID is unavailable on ordinary HTTP LAN origins.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `ui-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
