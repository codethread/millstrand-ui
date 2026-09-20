import { expect, it } from 'vitest';
import type { Card, WorkspaceOption } from '../../shared/api';
import { overviewActivity, workspaceActivity } from './overview';

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
  owner: null,
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
