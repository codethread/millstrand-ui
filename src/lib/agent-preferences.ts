import type { PromptReceipts } from './agent-notifications';

export interface AgentPreferences {
  aliases: Record<string, string>;
  receipts: PromptReceipts;
}

export const agentPreferencePrefix = 'millstrand-ui-agent:';
export function agentPreferenceKey(
  kind: 'alias' | 'receipt' | 'read',
  workspace: string,
  id = '',
): string {
  return `${agentPreferencePrefix}${kind}:${workspace}${id ? `:${id}` : ''}`;
}

/** Each preference, launch receipt, and read marker has its own atomic storage key.
 * A stale tab can never overwrite unrelated changes with its entire snapshot. */
export function readAgentPreferences(storage: Storage | null): AgentPreferences {
  const aliases: Record<string, string> = {};
  const receipts: PromptReceipts = {};
  if (!storage) return { aliases, receipts };
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null) continue;
    const match = /^millstrand-ui-agent:(alias|receipt):([a-f0-9]{24})(?::([a-zA-Z0-9_-]+))?$/.exec(
      key,
    );
    if (!match) continue;
    const workspace = match[2];
    if (!workspace) continue;
    const value = storage.getItem(key);
    if (
      match[1] === 'alias' &&
      !match[3] &&
      value &&
      /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(value)
    )
      aliases[workspace] = value;
    const id = match[3];
    if (match[1] === 'receipt' && id && value && /^ui-[a-zA-Z0-9_-]{16,80}$/.test(value)) {
      receipts[workspace] = {
        ...receipts[workspace],
        [id]: {
          requestId: value,
          read: storage.getItem(agentPreferenceKey('read', workspace, id)) === value,
        },
      };
    }
  }
  return { aliases, receipts };
}
