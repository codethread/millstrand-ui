import { expect, it } from 'vitest';
import type { Card, WorkspaceOption } from '../../shared/api';
import { sorted } from '../../shared/array';
import type { LogBinding } from '../../shared/log-activity';
import {
  agentPulse,
  cockpitWork,
  defaultAttentionLabels,
  overviewActivity,
  overviewCards,
  workspaceActivity,
} from './overview';

it('includes explicit asks outside active lanes, without reviving closed cards', () => {
  expect(
    sorted(
      overviewCards(
        [
          { ...card, id: 'ask', lane: 'refinement', labels: ['human-attention'] },
          { ...card, id: 'backlog', lane: 'pending' },
          { ...card, id: 'done', lane: 'closed', state: 'closed', labels: ['human-attention'] },
          card,
        ],
        defaultAttentionLabels,
      ).map((item) => item.id),
    ),
  ).toEqual(['ask', 'production']);
});

it('keeps explicit review-lane asks in attention, not duplicated into ready-for-a-look', () => {
  const snapshots = [
    workspaceActivity(
      workspace,
      {
        data: [
          { ...card, id: 'ask', lane: 'in_review', labels: ['auto-run-failure'] },
          { ...card, id: 'review', lane: 'in_review' },
        ],
        health: { kind: 'live' },
      },
      { data: [], health: { kind: 'live' } },
    ),
  ];
  const work = cockpitWork(
    snapshots,
    [],
    { search: '', scope: null, attentionLabels: defaultAttentionLabels },
    0,
  );
  expect(work.attention.map((item) => item.card.id)).toEqual(['ask']);
  expect(work.review.map((item) => item.card.id)).toEqual(['review']);
  expect(
    cockpitWork(
      snapshots,
      [],
      { search: '', scope: 'another', attentionLabels: defaultAttentionLabels },
      0,
    ).attention,
  ).toEqual([]);
  expect(
    cockpitWork(
      snapshots,
      [],
      { search: 'One review', scope: null, attentionLabels: defaultAttentionLabels },
      0,
    ).review,
  ).toHaveLength(1);
});

it('applies one custom label list across workspaces, with an empty list disabling attention', () => {
  const labels = ['approval-needed', 'decision'];
  const snapshots = [workspace, { ...workspace, id: 'two', name: 'Two' }].map((item) =>
    workspaceActivity(
      item,
      {
        data: overviewCards(
          [
            { ...card, id: 'ask', lane: 'refinement', labels: ['decision'] },
            { ...card, id: 'review', lane: 'in_review', labels: ['approval-needed'] },
            { ...card, id: 'closed', state: 'closed', labels: ['decision'] },
          ],
          labels,
        ),
        health: { kind: 'live' },
      },
      { data: [], health: { kind: 'live' } },
    ),
  );
  const configured = cockpitWork(
    snapshots,
    [],
    { search: '', scope: null, attentionLabels: labels },
    0,
  );
  expect(configured.attention.map((item) => [item.workspace.id, item.card.id])).toEqual([
    ['one', 'ask'],
    ['one', 'review'],
    ['two', 'ask'],
    ['two', 'review'],
  ]);
  expect(configured.review).toEqual([]);
  const disabled = cockpitWork(snapshots, [], { search: '', scope: null, attentionLabels: [] }, 0);
  expect(disabled.attention).toEqual([]);
  expect(disabled.review.map((item) => item.workspace.id)).toEqual(['one', 'two']);
});

it('only calls a running process quiet with fresh log evidence older than five minutes', () => {
  const binding: LogBinding = {
    identity: 'worker',
    identityStrandId: 'identity-worker',
    source: { provider: 'pi', session: 'session' },
    activity: {
      kind: 'available',
      modifiedAt: '2026-09-20T05:00:00Z',
      latest: {
        id: 'event',
        record: {
          v: 1,
          event: 'file',
          ts: '2026-09-20T05:00:00Z',
          session_id: 'session',
          tool: 'Read',
          file_path: 'README.md',
        },
      },
    },
  };
  expect(agentPulse(true, binding, false, Date.parse('2026-09-20T05:04:59Z')).kind).toBe('recent');
  expect(agentPulse(true, binding, false, Date.parse('2026-09-20T05:05:00Z'))).toMatchObject({
    kind: 'quiet',
    age: '5m',
  });
  expect(agentPulse(false, binding, false, Date.parse('2026-09-20T05:10:00Z')).kind).toBe('recent');
  expect(agentPulse(true, binding, true, Date.parse('2026-09-20T05:10:00Z')).kind).toBe(
    'last-known',
  );
  expect(agentPulse(true, null, false, Date.parse('2026-09-20T05:10:00Z')).kind).toBe('unknown');
  expect(
    agentPulse(
      true,
      { ...binding, activity: { kind: 'unavailable', message: 'Not readable' } },
      false,
      Date.parse('2026-09-20T05:10:00Z'),
    ).kind,
  ).toBe('unknown');
});

const workspace: WorkspaceOption = {
  id: 'one',
  name: 'One',
  path: '/one/.millstrand',
  status: 'running',
};
const card: Card = {
  id: 'production',
  title: 'Production',
  type: 'feature',
  state: 'active',
  lane: 'in_production',
  priority: 'p2',
  epicId: null,
  dependencies: { incoming: 0, outgoing: 0 },
  owner: null,
  reporter: null,
  ownership: { current: null, history: [] },
  branch: null,
  worktree: null,
  source: null,
  outcome: null,
  labels: [],
  autoRun: null,
  createdAt: '2026-09-18',
  updatedAt: null,
};

it('retains independent snapshots and counts while one source fails', () => {
  const retained = workspaceActivity(
    workspace,
    { data: [card], health: { kind: 'failed', message: 'Cards disconnected' } },
    { data: [], health: { kind: 'live' } },
  );
  const unavailable = workspaceActivity(
    { ...workspace, id: 'two' },
    { data: null, health: { kind: 'failed', message: 'No Kanban' } },
    { data: [], health: { kind: 'live' } },
  );
  const activity = overviewActivity([retained, unavailable]);
  expect(activity).toEqual({
    pinned: [],
    busy: [retained],
    other: [unavailable],
    cardCount: 1,
    agentCount: 0,
    partial: true,
  });
  expect(retained.agents.health.kind).toBe('live');
  expect(unavailable.board.data).toBeNull();
  expect(retained.board.data).toEqual([card]);
  expect(overviewActivity([unavailable, retained]).busy[0]?.workspace.id).toBe('one');
});

it('distinguishes quiet success, initial loading and offline retained activity', () => {
  const quiet = workspaceActivity(
    workspace,
    { data: [], health: { kind: 'live' } },
    { data: [], health: { kind: 'live' } },
  );
  const loading = workspaceActivity(
    workspace,
    { data: null, health: { kind: 'loading' } },
    { data: [], health: { kind: 'live' } },
  );
  const offline = workspaceActivity(
    { ...workspace, status: 'offline' },
    { data: [card], health: { kind: 'live' } },
    { data: [], health: { kind: 'live' } },
  );
  expect([quiet.status, loading.status, offline.status]).toEqual(['live', 'loading', 'offline']);
  expect(overviewActivity([quiet])).toMatchObject({ other: [quiet], partial: false });
  expect(overviewActivity([loading])).toMatchObject({ busy: [], partial: true });
  expect(overviewActivity([offline])).toMatchObject({
    busy: [offline],
    cardCount: 1,
    partial: true,
  });
});

it('promotes quiet pinned weavers without double-counting or losing activity', () => {
  const quiet = workspaceActivity(
    workspace,
    { data: [], health: { kind: 'live' } },
    { data: [], health: { kind: 'live' } },
  );
  const busy = workspaceActivity(
    { ...workspace, id: 'two' },
    { data: [card], health: { kind: 'live' } },
    { data: [], health: { kind: 'live' } },
  );
  expect(
    overviewActivity([busy, quiet], { one: { kind: 'pinned', name: 'One', path: '/one' } }),
  ).toEqual({
    pinned: [quiet],
    busy: [busy],
    other: [],
    cardCount: 1,
    agentCount: 0,
    partial: false,
  });
});
