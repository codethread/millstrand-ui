import type { AgentIdentity, AgentRun, AgentRunStatus } from '../../shared/api';

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

export function runLabel(run: AgentRun | null): string {
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
  return agents
    .filter((agent) => {
      const text = [
        agent.id,
        agent.harness,
        agent.model,
        ...agent.runs.flatMap((run) => [run.alias, run.harness, run.model]),
      ]
        .join(' ')
        .toLowerCase();
      return (!activeOnly || agentIsActive(agent)) && words.every((word) => text.includes(word));
    })
    .sort((a, b) => order[agentStatus(a)] - order[agentStatus(b)] || a.id.localeCompare(b.id));
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

export function issueAgentActivity(agent: AgentIdentity, id: string): string {
  const running = agent.runs.find((run) => run.status === 'running' && runTargets(run, id));
  if (running) return running.substatus === 'requested' ? 'Stopping' : 'Working';
  const queued = agent.runs.find((run) => run.status === 'ready' && runTargets(run, id));
  if (queued) return 'Queued';
  const run = currentRun(agent);
  return run?.status === 'running' ? `Session ${runLabel(run).toLowerCase()}` : runLabel(run);
}
