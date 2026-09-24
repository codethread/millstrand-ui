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
interface CardLogAgentBase {
  relation: 'target' | 'owner' | 'task-owner';
  tasks: CardLogTask[];
  group: 'current' | 'history';
}
export type CardLogAgent =
  | (CardLogAgentBase & {
      kind: 'identity';
      identity: AgentIdentity;
      run: AgentRun | null;
    })
  | (CardLogAgentBase & {
      kind: 'run';
      identity: null;
      run: AgentRun;
      relation: 'target';
    });

export function cardLogAgentKey(agent: CardLogAgent): string {
  return agent.kind === 'identity' ? agent.identity.strandId : `run:${agent.run.id}`;
}

function cardLogAgentTimestamp(agent: CardLogAgent): string {
  if (agent.kind === 'run') return agent.run.createdAt;
  return agent.run?.createdAt ?? agent.identity.createdAt;
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

/** One row per identity plus exact targeted runs that have not published a participant yet. */
export function cardLogAgents(
  agents: AgentIdentity[],
  owner: string | null,
  target: string,
  tasks: CardLogTask[],
  runs: AgentRun[] = [],
): CardLogAgent[] {
  const identityCounts = new Map<string, number>();
  for (const identity of agents)
    identityCounts.set(identity.id, (identityCounts.get(identity.id) ?? 0) + 1);
  const resolves = (friendly: string | null, identity: AgentIdentity) =>
    friendly === identity.id && identityCounts.get(identity.id) === 1;
  const identified = agents.flatMap((identity): CardLogAgent[] => {
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
        kind: 'identity',
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
  const identifiedRunIds = new Set(
    agents.flatMap((identity) => identity.runs.map((run) => run.id)),
  );
  const unbound = runs
    .filter(
      (run) =>
        !identifiedRunIds.has(run.id) &&
        run.participants.length === 0 &&
        (runTargets(run, target) || tasks.some((task) => runTargets(run, task.id))),
    )
    .map((run): CardLogAgent => ({
      kind: 'run',
      identity: null,
      run,
      relation: 'target',
      tasks: tasks.filter((task) => runTargets(run, task.id)),
      group: run.status === 'running' || run.status === 'ready' ? 'current' : 'history',
    }));
  return sorted(
    [...identified, ...unbound],
    (a, b) =>
      Number(a.group === 'history') - Number(b.group === 'history') ||
      Number(b.run?.status === 'running') - Number(a.run?.status === 'running') ||
      Number(b.kind === 'identity' && resolves(owner, b.identity)) -
        Number(a.kind === 'identity' && resolves(owner, a.identity)) ||
      cardLogAgentTimestamp(b).localeCompare(cardLogAgentTimestamp(a)),
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
      agents.find((candidate) => cardLogAgentKey(candidate) === chosen) ?? agents[0] ?? null,
    historyCount: hasCurrent
      ? candidates.filter((candidate) => candidate.group === 'history').length
      : 0,
  };
}

export function cardLogAgentContext(agent: CardLogAgent): string {
  const relationship =
    agent.kind === 'run'
      ? 'Linked run · identity registration pending'
      : agent.relation === 'target'
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
