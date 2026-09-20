import type { AgentIdentity, AgentRun, CardGraph } from '../../shared/api';
import type { LogEvent } from '../../shared/session-log';
import { sorted } from '../../shared/array';
import { currentRun, runLabel, runTargets } from './agents';
import { eventLabel, eventText } from './session-log';

export interface CardLogTask {
  id: string;
  title: string;
  state: string;
  owner: string | null;
}
export interface CardLogAgent {
  identity: AgentIdentity;
  run: AgentRun | null;
  relation: 'target' | 'owner' | 'task-owner';
  tasks: CardLogTask[];
  group: 'current' | 'history';
}

/** Only parent-of descendants count; dependency neighbours are not work on this card. */
export function cardLogTasks(graph: CardGraph): CardLogTask[] {
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind === 'parent-of') {
      children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
    }
  }
  const descendants = new Set<string>();
  const pending = [graph.rootId];
  for (const id of pending) {
    if (descendants.has(id)) continue;
    descendants.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return graph.nodes
    .filter((node) => node.id !== graph.rootId && node.kind === 'task' && descendants.has(node.id))
    .map((node) => ({
      id: node.id,
      title: node.title,
      state: node.state,
      owner: node.owner,
    }));
}

/** One row per identity, including untracked task owners and completed work. */
export function cardLogAgents(
  agents: AgentIdentity[],
  owner: string | null,
  target: string,
  tasks: CardLogTask[],
): CardLogAgent[] {
  const identityCounts = new Map<string, number>();
  for (const identity of agents)
    identityCounts.set(identity.id, (identityCounts.get(identity.id) ?? 0) + 1);
  const resolves = (friendly: string | null, identity: AgentIdentity) =>
    friendly === identity.id && identityCounts.get(identity.id) === 1;
  const matches = agents.flatMap((identity): CardLogAgent[] => {
    const ownedTasks = tasks.filter((task) => resolves(task.owner, identity));
    const targetedRuns = identity.runs.filter(
      (run) => runTargets(run, target) || tasks.some((task) => runTargets(run, task.id)),
    );
    const targeted =
      targetedRuns.find((run) => run.status === 'running') ??
      targetedRuns.find((run) => run.status === 'ready') ??
      targetedRuns[0];
    const ownsCard = resolves(owner, identity);
    if (!targeted && !ownsCard && !ownedTasks.length) return [];
    const current =
      ownsCard ||
      ownedTasks.some((task) => task.state === 'active') ||
      targetedRuns.some((run) => run.status === 'running' || run.status === 'ready');
    return [
      {
        identity,
        run: targeted ?? currentRun(identity),
        relation: targeted ? 'target' : ownsCard ? 'owner' : 'task-owner',
        tasks: sorted(
          tasks.filter(
            (task) =>
              resolves(task.owner, identity) ||
              targetedRuns.some((run) => runTargets(run, task.id)),
          ),
          (a, b) => Number(b.state === 'active') - Number(a.state === 'active'),
        ),
        group: current ? 'current' : 'history',
      },
    ];
  });
  return sorted(
    matches,
    (a, b) =>
      Number(a.group === 'history') - Number(b.group === 'history') ||
      Number(b.run?.status === 'running') - Number(a.run?.status === 'running') ||
      Number(resolves(owner, b.identity)) - Number(resolves(owner, a.identity)) ||
      (b.run?.createdAt ?? b.identity.createdAt).localeCompare(
        a.run?.createdAt ?? a.identity.createdAt,
      ),
  );
}

export function cardLogRoster(
  candidates: CardLogAgent[],
  chosen: string | null,
  showHistory: boolean,
) {
  const hasCurrent = candidates.some((candidate) => candidate.group === 'current');
  const agents = candidates.filter(
    (candidate) => !hasCurrent || showHistory || candidate.group === 'current',
  );
  return {
    agents,
    selected:
      agents.find((candidate) => candidate.identity.strandId === chosen) ?? agents[0] ?? null,
    historyCount: hasCurrent
      ? candidates.filter((candidate) => candidate.group === 'history').length
      : 0,
  };
}

export function cardLogAgentContext(agent: CardLogAgent): string {
  const relationship =
    agent.relation === 'target'
      ? 'Linked run'
      : agent.relation === 'owner'
        ? 'Feature owner'
        : 'Task owner';
  const tasks = agent.tasks.map(
    (task) => `${task.title}${task.state === 'closed' ? ' (completed)' : ''}`,
  );
  return [relationship, ...tasks].join(' · ');
}

export function cardLogAgentStatus(agent: CardLogAgent): string {
  if (agent.relation !== 'target') {
    if (agent.run?.status === 'running') return 'Session running';
    if (agent.run?.status === 'ready') return 'Session queued';
  }
  return runLabel(agent.run);
}
export function briefEvent(event: LogEvent): string {
  const text = eventText(event.record).replaceAll(/\s+/g, ' ');
  const path = event.record.file_path;
  return `${eventLabel(event.record)} · ${path ? path.split('/').slice(-2).join('/') : text.slice(0, 140)}`;
}
