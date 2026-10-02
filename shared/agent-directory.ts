import type { AgentDirectory, AgentIdentity, AgentRun } from './api.ts';

/** HTTP representation: shared run records are sent once and referenced by ID. */
export interface AgentDirectoryIdentity {
  id: string;
  strandId: string;
  harness: string;
  model: string | null;
  effort: string | null;
  parentIdentityStrandIds: string[];
  createdAt: string;
  runIds: string[];
  work: AgentIdentity['work'];
}

export interface AgentDirectoryPayload {
  workspace: AgentDirectory['workspace'];
  fetchedAt: string;
  identities: AgentDirectoryIdentity[];
  runs: AgentRun[];
}

export function encodeAgentDirectory(directory: AgentDirectory): AgentDirectoryPayload {
  return {
    workspace: directory.workspace,
    fetchedAt: directory.fetchedAt,
    identities: directory.identities.map(({ runs, ...identity }) => ({
      ...identity,
      runIds: runs.map((run) => run.id),
    })),
    runs: directory.runs,
  };
}

export function decodeAgentDirectory(payload: AgentDirectoryPayload): AgentDirectory {
  const runsById = new Map(payload.runs.map((run) => [run.id, run]));
  return {
    workspace: payload.workspace,
    fetchedAt: payload.fetchedAt,
    identities: payload.identities.map(({ runIds, ...identity }) => ({
      ...identity,
      runs: runIds.map((runId) => {
        const run = runsById.get(runId);
        if (run === undefined)
          throw new Error(`Agent identity ${identity.strandId} references missing run ${runId}`);
        return run;
      }),
    })),
    runs: payload.runs,
  };
}
