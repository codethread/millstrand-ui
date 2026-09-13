import { describe, expect, it } from 'vitest';
import type { AgentIdentity, AgentRun } from '../../shared/api';
import {
  agentIsActive,
  currentRun,
  issueAgentActivity,
  issueAgents,
  issueRun,
  runLabel,
  selectAgents,
} from './agents';

function run(change: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run1',
    title: 'Work',
    alias: 'luna-high',
    harness: 'pi',
    status: 'running',
    substatus: null,
    mode: 'headless',
    model: 'test-model',
    effort: 'high',
    cwd: '/workspace',
    target: null,
    rootTargets: [],
    createdAt: '2026-09-13 10:00:00',
    startedAt: null,
    finishedAt: null,
    ...change,
  };
}
function identity(runs: AgentRun[], id = 'calm-young-tiger'): AgentIdentity {
  return {
    id,
    strandId: 'identity1',
    harness: 'pi',
    model: null,
    effort: null,
    createdAt: '2026-09-13 10:00:00',
    runs,
    work: [],
  };
}

describe('agent activity and issue attribution', () => {
  it.each([
    ['running', true, 'Running'],
    ['ready', true, 'Queued'],
    ['stopped', false, 'Stopped'],
    ['failed', false, 'Failed'],
    ['unknown', false, 'Unknown'],
  ] as const)('projects %s without conflating ownership and execution', (status, active, label) => {
    const item = run({ status });
    expect(agentIsActive(identity([item]))).toBe(active);
    expect(runLabel(item)).toBe(label);
  });

  it('keeps an untracked identity unknown and distinguishes completed and stopping runs', () => {
    expect(agentIsActive(identity([]))).toBe(false);
    expect(runLabel(null)).toBe('Untracked');
    expect(runLabel(run({ status: 'stopped', substatus: 'completed' }))).toBe('Completed');
    expect(runLabel(run({ substatus: 'requested' }))).toBe('Stopping');
  });

  it('does not claim an owner is working on a card without explicit targeting evidence', () => {
    const owner = identity([run()]);
    expect(issueAgents([owner], owner.id, 'card1')).toEqual([owner]);
    expect(issueAgentActivity(owner, 'card1')).toBe('Session running');
    expect(issueAgents([owner], null, 'card1')).toEqual([]);
  });

  it('links direct and root-targeted work even when the agent is not the card owner', () => {
    const direct = identity([run({ target: 'card1' })]);
    const descendant = identity([run({ rootTargets: ['card1'] })], 'bright-calm-otter');
    const stopped = identity([run({ status: 'stopped', target: 'card1' })], 'quiet-old-fox');
    expect(issueAgents([direct, descendant, stopped], null, 'card1')).toEqual([direct, descendant]);
    expect(issueAgentActivity(direct, 'card1')).toBe('Working');
    expect(issueAgentActivity(descendant, 'card1')).toBe('Working');
  });

  it('uses the matching run alias and never describes a queued target as running', () => {
    const targeted = run({ id: 'targeted', alias: 'reviewer', status: 'ready', target: 'card1' });
    const agent = identity([run(), targeted]);
    expect(issueRun(agent, 'card1')).toBe(targeted);
    expect(issueAgentActivity(agent, 'card1')).toBe('Queued');
  });

  it('keeps an active continuation above terminal history', () => {
    const active = run({ id: 'active' });
    expect(currentRun(identity([run({ status: 'stopped' }), active]))).toBe(active);
  });
});

describe('identity discovery', () => {
  const running = identity([run()]);
  const queued = identity([run({ status: 'ready', alias: 'reviewer' })], 'bright-calm-otter');
  const stopped = identity([run({ status: 'stopped', alias: 'oracle' })], 'amber-cool-puma');
  const agents = [stopped, queued, running];

  it('sorts live sessions first and filters active sessions explicitly', () => {
    expect(selectAgents(agents, '', false)).toEqual([running, queued, stopped]);
    expect(selectAgents(agents, '', true)).toEqual([running, queued]);
  });

  it.each(['calm-young', 'LUNA-HIGH', 'pi test-model luna'])(
    'searches identity, aliases and model: %s',
    (query) => {
      expect(selectAgents(agents, query, false)).toEqual([running]);
    },
  );

  it('keeps terminal identities searchable and does not match work titles as identities', () => {
    expect(selectAgents(agents, 'oracle', false)).toEqual([stopped]);
    expect(selectAgents(agents, 'oracle', true)).toEqual([]);
    expect(selectAgents(agents, 'Work', false)).toEqual([]);
  });
});
