import { describe, expect, it } from 'vitest';
import type { AgentIdentity, AgentRun } from '../../shared/api';
import {
  agentIsActive,
  agentRunIdentities,
  currentRun,
  conflictingPromptRuns,
  issueAgentActivity,
  issueAgents,
  issueRun,
  relevantAgentActivity,
  runLabel,
  selectAgents,
  selectedAgentActivity,
  targetAgentRunIds,
} from './agents';

function run(change: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run1',
    requestId: null,
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
    workflow: null,
    participants: [],
    continuation: null,
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
  it('blocks only active direct targets, deduplicates runs, and permits receipt recovery', () => {
    const active = run({ id: 'active', target: 'card1' });
    const queued = run({ id: 'queued', target: 'card1', status: 'ready' });
    const agents = [
      identity([
        active,
        queued,
        run({ id: 'finished', target: 'card1', status: 'stopped' }),
        run({ id: 'failed', target: 'card1', status: 'failed' }),
        run({ id: 'descendant', target: 'task1', rootTargets: ['card1'] }),
        run({ id: 'receipt', target: 'card1', requestId: 'ui-existing' }),
      ]),
      identity([active], 'second-identity'),
    ];
    expect(conflictingPromptRuns(agents, 'card1', 'ui-existing')).toEqual([active, queued]);
    expect(conflictingPromptRuns(agents, 'other', 'ui-existing')).toEqual([]);
  });
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

  it('does not select an ambiguous friendly identity as owner or exact-run participant', () => {
    const sharedRun = run({ id: 'shared', target: 'card1' });
    const duplicateA = identity([sharedRun], 'duplicate');
    const duplicateB = { ...identity([sharedRun], 'duplicate'), strandId: 'identity2' };
    expect(issueAgents([duplicateA, duplicateB], 'duplicate', 'other')).toEqual([]);
    expect(selectedAgentActivity([duplicateA, duplicateB], 'duplicate', null)).toBeNull();
    expect(selectedAgentActivity([duplicateA, duplicateB], null, 'shared')).toBeNull();
    expect(agentRunIdentities([duplicateA, duplicateB])).toEqual({});
  });

  it('links direct and root-targeted work even when the agent is not the card owner', () => {
    const direct = identity([run({ target: 'card1' })]);
    const descendant = identity([run({ rootTargets: ['card1'] })], 'bright-calm-otter');
    const stopped = identity([run({ status: 'stopped', target: 'card1' })], 'quiet-old-fox');
    expect(issueAgents([direct, descendant, stopped], null, 'card1')).toEqual([direct, descendant]);
    expect(issueAgentActivity(direct, 'card1')).toBe('Working');
    expect(issueAgentActivity(descendant, 'card1')).toBe('Working');
  });

  it('surfaces active workflow reviewers on their feature and removes them when settled', () => {
    const workflow = {
      rootId: 'land-root',
      runId: 'land-auto-card1',
      cardId: 'card1',
      role: 'reviewer',
    };
    const active = identity(
      [run({ id: 'review', alias: 'reviewer', target: 'review-gate', workflow })],
      'gentle-ready-fox',
    );
    const settled = identity(
      [
        run({
          id: 'review',
          alias: 'reviewer',
          target: 'review-gate',
          workflow,
          status: 'stopped',
        }),
      ],
      'gentle-ready-fox',
    );

    expect(relevantAgentActivity([active], null, 'card1')).toMatchObject([
      { identity: { id: 'gentle-ready-fox' }, run: { id: 'review' }, label: 'Working' },
    ]);
    expect(relevantAgentActivity([settled], null, 'card1')).toEqual([]);
  });

  it('uses the matching run alias and never describes a queued target as running', () => {
    const targeted = run({ id: 'targeted', alias: 'reviewer', status: 'ready', target: 'card1' });
    const agent = identity([run(), targeted]);
    expect(issueRun(agent, 'card1')).toBe(targeted);
    expect(issueAgentActivity(agent, 'card1')).toBe('Queued');
    expect(relevantAgentActivity([agent], agent.id, 'card1')).toEqual([
      { identity: agent, run: targeted, label: 'Queued', relation: 'queued' },
    ]);
  });

  it('keeps an active continuation above terminal history', () => {
    const active = run({ id: 'active' });
    expect(currentRun(identity([run({ status: 'stopped' }), active]))).toBe(active);
  });

  it('resolves an exact run even when a shared URL has no identity or a stale identity', () => {
    const terminal = run({ id: 'terminal', status: 'stopped', target: 'review1' });
    const expected = identity([terminal], 'exact-run-owner');
    const unrelated = identity([run({ id: 'other' })], 'stale-url-owner');
    expect(selectedAgentActivity([unrelated, expected], null, terminal.id)).toMatchObject({
      identity: expected,
      selectedRun: terminal,
      requestedRunMissing: false,
    });
    expect(selectedAgentActivity([unrelated, expected], unrelated.id, terminal.id)?.identity).toBe(
      expected,
    );
  });

  it('publishes run-owner and target indexes without directory refresh metadata', () => {
    const reviewRun = run({ id: 'review-run', target: 'review1' });
    const otherRun = run({ id: 'other-run', target: 'card1' });
    const agents = [identity([reviewRun]), identity([otherRun], 'other-owner')];
    expect(agentRunIdentities(agents)).toEqual({
      'review-run': 'calm-young-tiger',
      'other-run': 'other-owner',
    });
    expect(targetAgentRunIds(agents, 'review1')).toEqual(['review-run']);
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
