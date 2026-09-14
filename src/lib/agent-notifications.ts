import type { AgentIdentity, AgentRun } from '../../shared/api';

export interface PromptReceipt {
  requestId: string;
  read: boolean;
}
export type PromptReceipts = Record<string, Record<string, PromptReceipt>>;

export function parsePromptReceipts(value: unknown): PromptReceipts {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: PromptReceipts = {};
  for (const [workspace, entries] of Object.entries(value)) {
    if (
      !/^[a-f0-9]{24}$/.test(workspace) ||
      typeof entries !== 'object' ||
      entries === null ||
      Array.isArray(entries)
    )
      continue;
    const receipts: Record<string, PromptReceipt> = {};
    for (const [id, receipt] of Object.entries(entries).slice(-200)) {
      if (
        /^[a-zA-Z0-9_-]+$/.test(id) &&
        typeof receipt === 'object' &&
        receipt !== null &&
        'requestId' in receipt &&
        typeof receipt.requestId === 'string' &&
        /^ui-[a-zA-Z0-9_-]{16,80}$/.test(receipt.requestId) &&
        'read' in receipt &&
        typeof receipt.read === 'boolean'
      )
        receipts[id] = { requestId: receipt.requestId, read: receipt.read };
    }
    result[workspace] = receipts;
  }
  return result;
}

export function runIsFinished(run: Pick<AgentRun, 'status'>): boolean {
  return run.status === 'stopped' || run.status === 'failed';
}

/** A server-acknowledged local receipt AND the durable CLI request id must match.
 * Ordinary workflow, terminal, and desktop runs never enter the header counts. */
export function promptedRuns(agents: AgentIdentity[], receipts: Record<string, PromptReceipt>) {
  return agents
    .flatMap((agent) =>
      agent.runs.flatMap((run) => {
        const receipt = receipts[run.id];
        return receipt && run.requestId === receipt.requestId
          ? [{ identity: agent.id, run, unread: !receipt.read && runIsFinished(run) }]
          : [];
      }),
    )
    .sort(
      (a, b) => b.run.createdAt.localeCompare(a.run.createdAt) || b.run.id.localeCompare(a.run.id),
    );
}
