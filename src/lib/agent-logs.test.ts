import { describe, expect, it } from 'vitest';
import type { AgentIdentity, AgentRun, CardGraph, GraphNode } from '../../shared/api';
import {
  cardLogAgentContext,
  cardLogAgents,
  cardLogAgentStatus,
  cardLogRoster,
  cardLogTasks,
  type CardLogTask,
} from './agent-logs';

function identity(id: string, runs: AgentRun[] = []): AgentIdentity {
  return {
    id,
    strandId: id,
    harness: 'pi',
    model: null,
    effort: null,
    createdAt: '2026-09-18',
    runs,
    work: [],
  };
}
function run(change: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run',
    requestId: null,
    title: 'Task work',
    alias: 'worker',
    harness: 'pi',
    status: 'running',
    substatus: null,
    mode: 'headless',
    model: null,
    effort: null,
    cwd: '/workspace',
    target: null,
    rootTargets: [],
    participants: [],
    continuation: null,
    createdAt: '2026-09-18',
    startedAt: null,
    finishedAt: null,
    ...change,
  };
}
function task(id: string, owner: string | null, state = 'active'): CardLogTask {
  return { id, title: `Task ${id}`, owner, state };
}
function node(id: string, kind: GraphNode['kind'] = 'task'): GraphNode {
  return {
    id,
    title: id,
    kind,
    state: 'active',
    owner: 'worker',
    dependencies: { incoming: 0, outgoing: 0 },
    attributes: {},
    createdAt: null,
    updatedAt: null,
  };
}

describe('card agent roster', () => {
  it('includes task owners without managed runs and deduplicates multiple ownership links', () => {
    const agents = [identity('feature-owner'), identity('task-owner'), identity('unrelated')];
    const tasks = [
      task('first', 'task-owner'),
      task('second', 'task-owner'),
      task('third', 'feature-owner'),
    ];
    const roster = cardLogAgents(agents, 'feature-owner', 'feature', tasks);
    expect(roster.map((agent) => agent.identity.id)).toEqual(['feature-owner', 'task-owner']);
    expect(roster[1]).toMatchObject({
      relation: 'task-owner',
      run: null,
      group: 'current',
      tasks: tasks.slice(0, 2),
    });
    expect(roster[0]?.tasks).toEqual([tasks[2]]);
    expect(cardLogAgentContext(roster[1]!)).toBe('Task owner · Task first · Task second');
    expect(cardLogAgentStatus(roster[1]!)).toBe('Untracked');
  });

  it('keeps completed-task owners available behind current work, even when another session is running', () => {
    const past = identity('past', [run({ target: 'unrelated' })]);
    const current = identity('current');
    const roster = cardLogAgents([past, current], null, 'feature', [
      task('old', 'past', 'closed'),
      task('new', 'current'),
    ]);
    expect(roster.map((agent) => [agent.identity.id, agent.group])).toEqual([
      ['current', 'current'],
      ['past', 'history'],
    ]);
    expect(cardLogAgentStatus(roster[1]!)).toBe('Session running');
    expect(cardLogAgentContext(roster[1]!)).toContain('(completed)');
  });

  it('keeps duplicate friendly identities separately selectable by immutable strand id', () => {
    const first = identity('duplicate', [run({ id: 'first', target: 'feature' })]);
    const second = {
      ...identity('duplicate', [run({ id: 'second', target: 'feature' })]),
      strandId: 'identity-duplicate-second',
    };
    const candidates = cardLogAgents([first, second], null, 'feature', []);
    expect(cardLogRoster(candidates, 'identity-duplicate-second', false).selected?.identity).toBe(
      second,
    );
  });

  it('keeps selection inside visible rows and still opens logs when only past work exists', () => {
    const candidates = cardLogAgents([identity('current'), identity('past')], null, 'feature', [
      task('new', 'current'),
      task('old', 'past', 'closed'),
    ]);
    expect(cardLogRoster(candidates, 'past', false)).toMatchObject({
      agents: [candidates[0]],
      selected: candidates[0],
      historyCount: 1,
    });
    expect(cardLogRoster(candidates, 'past', true).selected).toBe(candidates[1]);
    expect(cardLogRoster(candidates.slice(1), null, false).selected).toBe(candidates[1]);
    expect(cardLogRoster([], 'missing', false).selected).toBeNull();
  });

  it('includes direct task runs without root-target metadata, and prefers queued work over terminal history', () => {
    const completed = run({
      id: 'done',
      target: 'feature',
      status: 'stopped',
      substatus: 'completed',
    });
    const queued = run({ id: 'next', target: 'child', status: 'ready' });
    const roster = cardLogAgents([identity('worker', [completed, queued])], null, 'feature', [
      task('child', null),
    ]);
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({
      run: queued,
      relation: 'target',
      group: 'current',
      tasks: [task('child', null)],
    });
    expect(cardLogAgentStatus(roster[0]!)).toBe('Queued');
  });

  it('retains root-targeted and completed feature runs without inventing ownership', () => {
    const live = identity('live', [run({ target: 'nested', rootTargets: ['feature'] })]);
    const past = identity('past', [
      run({ target: 'feature', status: 'stopped', substatus: 'completed' }),
    ]);
    expect(
      cardLogAgents([past, live], null, 'feature', []).map((agent) => [
        agent.identity.id,
        agent.relation,
        agent.group,
      ]),
    ).toEqual([
      ['live', 'target', 'current'],
      ['past', 'target', 'history'],
    ]);
    expect(
      cardLogAgents([identity('unrelated', [run({ target: 'elsewhere' })])], null, 'feature', []),
    ).toEqual([]);
  });
});

it('finds nested task owners through parent-of edges, excluding dependencies and the root', () => {
  const graph: CardGraph = {
    rootId: 'feature',
    nodes: [
      node('feature', 'feature'),
      node('first'),
      node('nested'),
      node('dependency'),
      node('unrelated'),
    ],
    edges: [
      { kind: 'parent-of', from: 'feature', to: 'first' },
      { kind: 'parent-of', from: 'first', to: 'nested' },
      { kind: 'depends-on', from: 'nested', to: 'dependency' },
      { kind: 'parent-of', from: 'unrelated', to: 'dependency' },
    ],
  };
  expect(cardLogTasks(graph).map((item) => [item.id, item.owner])).toEqual([
    ['first', 'worker'],
    ['nested', 'worker'],
  ]);
});
