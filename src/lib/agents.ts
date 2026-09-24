import type { AgentDirectory, AgentIdentity, AgentRun, AgentRunStatus } from '../../shared/api';
import { sorted } from '../../shared/array';

export type AgentRunLabel =
  'Untracked' | 'Unknown' | 'Queued' | 'Stopping' | 'Running' | 'Failed' | 'Completed' | 'Stopped';

export interface AgentDirectorySummary {
  total: number;
  active: number;
}

export type RelevantAgentActivity =
  | {
      kind: 'identity';
      identity: AgentIdentity;
      run: AgentRun | null;
      label: AgentRunLabel | 'Working' | 'Session running';
      relation: 'working' | 'queued' | 'owner-session' | 'owner';
    }
  | {
      kind: 'run';
      identity: null;
      run: AgentRun;
      label: 'Working' | 'Stopping' | 'Queued';
      relation: 'working' | 'queued';
    };

export type SelectedAgentActivity =
  | {
      kind: 'identity';
      identity: AgentIdentity;
      currentRun: AgentRun | null;
      selectedRun: AgentRun | null;
      requestedRunMissing: boolean;
    }
  | { kind: 'run'; run: AgentRun };

export function currentRun(agent: AgentIdentity): AgentRun | null {
  return (
    agent.runs.find((run) => run.status === 'running') ??
    agent.runs.find((run) => run.status === 'ready') ??
    agent.runs[0] ??
    null
  );
}

export function agentStatus(agent: AgentIdentity): AgentRunStatus {
  return currentRun(agent)?.status ?? 'unknown';
}

export function agentIsActive(agent: AgentIdentity): boolean {
  return agentStatus(agent) === 'running' || agentStatus(agent) === 'ready';
}

export function runIsActive(run: AgentRun): boolean {
  return run.status === 'running' || run.status === 'ready';
}

export function runLabel(run: AgentRun | null): AgentRunLabel {
  if (!run) return 'Untracked';
  if (run.status === 'unknown') return 'Unknown';
  if (run.status === 'ready') return 'Queued';
  if (run.status === 'running') return run.substatus === 'requested' ? 'Stopping' : 'Running';
  if (run.status === 'failed') return 'Failed';
  return run.substatus === 'completed' ? 'Completed' : 'Stopped';
}

export function runDisplayName(run: AgentRun): string {
  if (run.alias !== null) return run.alias;
  return run.ownership === 'external' ? `Direct ${run.harness} session` : `${run.harness} run`;
}

export function effortLabel(effort: string | null): string {
  if (effort === null) return 'Not recorded';
  return effort === 'unknown' ? 'Unknown' : effort;
}

function matchesRun(run: AgentRun, words: string[]): boolean {
  return words.every((word) =>
    [run.id, run.alias, run.harness, run.model, run.title].join(' ').toLowerCase().includes(word),
  );
}

export function selectAgents(
  agents: AgentIdentity[],
  query: string,
  activeOnly: boolean,
): AgentIdentity[] {
  const words = query.trim().toLowerCase().split(/\s+/);
  const order: Record<AgentRunStatus, number> = {
    running: 0,
    ready: 1,
    failed: 2,
    stopped: 3,
    unknown: 4,
  };
  return sorted(
    agents.filter((agent) => {
      const text = [
        agent.id,
        agent.harness,
        agent.model,
        ...agent.runs.flatMap((run) => [run.alias, run.harness, run.model]),
      ]
        .join(' ')
        .toLowerCase();
      return (!activeOnly || agentIsActive(agent)) && words.every((word) => text.includes(word));
    }),
    (a, b) => order[agentStatus(a)] - order[agentStatus(b)] || a.id.localeCompare(b.id),
  );
}

/** Published runs awaiting a native `performed` binding remain visible without a made-up actor. */
export function selectUnboundRuns(
  runs: AgentRun[],
  query: string,
  activeOnly: boolean,
): AgentRun[] {
  const words = query.trim().toLowerCase().split(/\s+/);
  return runs.filter(
    (run) =>
      run.participants.length === 0 && (!activeOnly || runIsActive(run)) && matchesRun(run, words),
  );
}

export function activeAgentIdentities(agents: AgentIdentity[]): AgentIdentity[] {
  return selectAgents(agents, '', true);
}

export function agentDirectorySummary(directory: AgentDirectory): AgentDirectorySummary {
  const unbound = selectUnboundRuns(directory.runs, '', false);
  return {
    total: directory.identities.length + unbound.length,
    active: directory.identities.filter(agentIsActive).length + unbound.filter(runIsActive).length,
  };
}

export function runTargets(run: AgentRun, id: string): boolean {
  return run.target === id || run.rootTargets.includes(id);
}

export function issueAgents(
  agents: AgentIdentity[],
  owner: string | null,
  id: string,
): AgentIdentity[] {
  const ownerMatches = owner === null ? [] : agents.filter((agent) => agent.id === owner);
  const resolvedOwner = ownerMatches.length === 1 ? ownerMatches[0] : null;
  return agents.filter(
    (agent) =>
      agent === resolvedOwner || agent.runs.some((run) => runIsActive(run) && runTargets(run, id)),
  );
}

export function issueRun(agent: AgentIdentity, id: string): AgentRun | null {
  return (
    agent.runs.find((run) => run.status === 'running' && runTargets(run, id)) ??
    agent.runs.find((run) => run.status === 'ready' && runTargets(run, id)) ??
    currentRun(agent)
  );
}

export function issueAgentActivity(
  agent: AgentIdentity,
  id: string,
): RelevantAgentActivity['label'] {
  const running = agent.runs.find((run) => run.status === 'running' && runTargets(run, id));
  if (running) return running.substatus === 'requested' ? 'Stopping' : 'Working';
  const queued = agent.runs.find((run) => run.status === 'ready' && runTargets(run, id));
  if (queued) return 'Queued';
  const run = currentRun(agent);
  return run?.status === 'running' ? 'Session running' : runLabel(run);
}

export function relevantAgentActivity(
  agents: AgentIdentity[],
  runs: AgentRun[],
  owner: string | null,
  target: string,
): RelevantAgentActivity[] {
  const identified = issueAgents(agents, owner, target).map((identity) => {
    const run = issueRun(identity, target);
    const label = issueAgentActivity(identity, target);
    return {
      kind: 'identity' as const,
      identity,
      run,
      label,
      relation:
        label === 'Working' || label === 'Stopping'
          ? ('working' as const)
          : label === 'Queued'
            ? ('queued' as const)
            : label === 'Session running'
              ? ('owner-session' as const)
              : ('owner' as const),
    };
  });
  const identifiedRunIds = new Set(
    agents.flatMap((identity) => identity.runs.map((run) => run.id)),
  );
  const unbound = runs
    .filter(
      (run) =>
        !identifiedRunIds.has(run.id) &&
        run.participants.length === 0 &&
        runIsActive(run) &&
        runTargets(run, target),
    )
    .map((run): RelevantAgentActivity => ({
      kind: 'run',
      identity: null,
      run,
      label:
        run.status === 'ready' ? 'Queued' : run.substatus === 'requested' ? 'Stopping' : 'Working',
      relation: run.status === 'ready' ? 'queued' : 'working',
    }));
  return [...identified, ...unbound];
}

/** Exact strand IDs and exact runs win; friendly IDs remain a legacy URL lookup only when unique. */
export function selectedAgentActivity(
  directory: Pick<AgentDirectory, 'identities' | 'runs'>,
  identitySelector: string | null,
  runId: string | null,
): SelectedAgentActivity | null {
  const selectedRun =
    runId === null ? null : (directory.runs.find((candidate) => candidate.id === runId) ?? null);
  if (selectedRun !== null) {
    const participants = directory.identities.filter((identity) =>
      identity.runs.some((run) => run.id === selectedRun.id),
    );
    const exact = participants.find((identity) => identity.strandId === identitySelector);
    const friendly = participants.filter((identity) => identity.id === identitySelector);
    const identity =
      exact ??
      (participants.length === 1 ? participants[0] : undefined) ??
      (friendly.length === 1 ? friendly[0] : undefined);
    if (identity === undefined) return { kind: 'run', run: selectedRun };
    return {
      kind: 'identity',
      identity,
      currentRun: currentRun(identity),
      selectedRun,
      requestedRunMissing: false,
    };
  }
  const exact = directory.identities.find((identity) => identity.strandId === identitySelector);
  const friendly = directory.identities.filter((identity) => identity.id === identitySelector);
  const identity = exact ?? (friendly.length === 1 ? friendly[0] : undefined);
  if (identity === undefined) return null;
  return {
    kind: 'identity',
    identity,
    currentRun: currentRun(identity),
    selectedRun: runId === null ? currentRun(identity) : null,
    requestedRunMissing: runId !== null,
  };
}

export function agentRunIdentities(agents: AgentIdentity[]): Record<string, string> {
  const participants = new Map<string, AgentIdentity[]>();
  for (const identity of agents) {
    for (const run of identity.runs) {
      participants.set(run.id, [...(participants.get(run.id) ?? []), identity]);
    }
  }
  return Object.fromEntries(
    [...participants].flatMap(([runId, identities]) =>
      identities.length === 1 ? [[runId, identities[0]!.strandId] as const] : [],
    ),
  );
}

export function targetAgentRunIds(runs: AgentRun[], target: string): string[] {
  return [...new Set(runs.filter((run) => run.target === target).map((run) => run.id))];
}
