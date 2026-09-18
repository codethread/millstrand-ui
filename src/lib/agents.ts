import type { AgentIdentity, AgentRun, AgentRunStatus } from '../../shared/api';
import { sorted } from '../../shared/array';

export type AgentRunLabel =
  'Untracked' | 'Unknown' | 'Queued' | 'Stopping' | 'Running' | 'Failed' | 'Completed' | 'Stopped';

export interface AgentDirectorySummary {
  total: number;
  active: number;
}

export interface RelevantAgentActivity {
  identity: AgentIdentity;
  run: AgentRun | null;
  label: AgentRunLabel | 'Working' | 'Session running';
  relation: 'working' | 'queued' | 'owner-session' | 'owner';
}

export interface SelectedAgentActivity {
  identity: AgentIdentity;
  currentRun: AgentRun | null;
  selectedRun: AgentRun | null;
  requestedRunMissing: boolean;
}

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

export function runLabel(run: AgentRun | null): AgentRunLabel {
  if (!run) return 'Untracked';
  if (run.status === 'unknown') return 'Unknown';
  if (run.status === 'ready') return 'Queued';
  if (run.status === 'running') return run.substatus === 'requested' ? 'Stopping' : 'Running';
  if (run.status === 'failed') return 'Failed';
  return run.substatus === 'completed' ? 'Completed' : 'Stopped';
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

export function activeAgentIdentities(agents: AgentIdentity[]): AgentIdentity[] {
  return selectAgents(agents, '', true);
}

export function agentDirectorySummary(agents: AgentIdentity[]): AgentDirectorySummary {
  return { total: agents.length, active: agents.filter(agentIsActive).length };
}

export function runTargets(run: AgentRun, id: string): boolean {
  return run.target === id || run.rootTargets.includes(id);
}

export function issueAgents(
  agents: AgentIdentity[],
  owner: string | null,
  id: string,
): AgentIdentity[] {
  return agents.filter(
    (agent) =>
      agent.id === owner ||
      agent.runs.some(
        (run) => (run.status === 'running' || run.status === 'ready') && runTargets(run, id),
      ),
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
  owner: string | null,
  target: string,
): RelevantAgentActivity[] {
  return issueAgents(agents, owner, target).map((identity) => {
    const run = issueRun(identity, target);
    const label = issueAgentActivity(identity, target);
    return {
      identity,
      run,
      label,
      relation:
        label === 'Working' || label === 'Stopping'
          ? 'working'
          : label === 'Queued'
            ? 'queued'
            : label === 'Session running'
              ? 'owner-session'
              : 'owner',
    };
  });
}

/** An exact run is authoritative when a shared URL also contains a stale or absent identity. */
export function selectedAgentActivity(
  agents: AgentIdentity[],
  identityId: string | null,
  runId: string | null,
): SelectedAgentActivity | null {
  const runIdentity = runId
    ? agents.find((identity) => identity.runs.some((run) => run.id === runId))
    : undefined;
  const identity = runIdentity ?? agents.find((candidate) => candidate.id === identityId);
  if (!identity) return null;
  const selectedRun = runId
    ? (identity.runs.find((run) => run.id === runId) ?? null)
    : currentRun(identity);
  return {
    identity,
    currentRun: currentRun(identity),
    selectedRun,
    requestedRunMissing: runId !== null && selectedRun === null,
  };
}

export function agentRunIdentities(agents: AgentIdentity[]): Record<string, string> {
  return Object.fromEntries(
    agents.flatMap((identity) => identity.runs.map((run) => [run.id, identity.id] as const)),
  );
}

export function targetAgentRunIds(agents: AgentIdentity[], target: string): string[] {
  return [
    ...new Set(
      agents.flatMap((identity) =>
        identity.runs.filter((run) => run.target === target).map((run) => run.id),
      ),
    ),
  ];
}
