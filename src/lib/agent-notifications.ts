import type { AgentIdentity, AgentRun } from '../../shared/api';

export interface PromptReceipt {
  requestId: string;
  read: boolean;
}
export type PromptReceipts = Record<string, Record<string, PromptReceipt>>;

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
