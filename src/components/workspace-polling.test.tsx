import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { WorkspaceOption } from '../../shared/api';
import { useOverview } from '../hooks/use-overview';
import { createQueryClient } from '../lib/api/query-client';
import { logActivityOptions } from '../lib/api/log-activity';
import type { WorkspacePreferences } from '../lib/workspaces';
import { OverviewLogPolls } from './overview-log-polls';
import { needsWorkspaceLogActivity } from './workspace-resource-polls';

const state = vi.hoisted(() => ({ preferences: {} as WorkspacePreferences }));
vi.mock('../workspace-preference-store', () => ({
  useWorkspacePreferenceStore: (select: (value: typeof state) => unknown) => select(state),
}));

const visible: WorkspaceOption = {
  id: 'visible',
  name: 'Visible',
  path: '/visible',
  status: 'running',
};
const hidden: WorkspaceOption = {
  id: 'hidden',
  name: 'Hidden',
  path: '/hidden',
  status: 'running',
};
function OverviewOwners() {
  const { options } = useOverview();
  return (
    <>
      <span>{options.map((option) => option.name).join(',')}</span>
      <OverviewLogPolls />
    </>
  );
}

it('creates board, agent and log queries only for visible weavers, and restores all three on unhide', () => {
  state.preferences = { hidden: { kind: 'hidden', name: hidden.name, path: hidden.path } };
  const client = createQueryClient();
  client.setQueryData(['workspaces'], [visible, hidden]);
  const render = () =>
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <OverviewOwners />
      </QueryClientProvider>,
    );
  expect(render()).toContain('Visible');
  for (const key of ['board', 'agents', 'log-activity']) {
    expect(client.getQueryCache().find({ queryKey: [key, 'hidden'], exact: true })).toBeUndefined();
    expect(client.getQueryCache().find({ queryKey: [key, 'visible'], exact: true })).toBeDefined();
  }
  state.preferences = {};
  expect(render()).toContain('Visible,Hidden');
  for (const key of ['board', 'agents', 'log-activity'])
    expect(client.getQueryCache().find({ queryKey: [key, 'hidden'], exact: true })).toBeDefined();
  client.clear();
});

it('polls selected-workspace logs only where an activity consumer is visible', () => {
  const nothingSelected = { issue: null, agent: null, agentRun: null };
  expect(needsWorkspaceLogActivity('board', nothingSelected)).toBe(true);
  expect(needsWorkspaceLogActivity('outline', nothingSelected)).toBe(true);
  expect(needsWorkspaceLogActivity('graph', nothingSelected)).toBe(true);
  expect(needsWorkspaceLogActivity('completed', nothingSelected)).toBe(true);
  expect(needsWorkspaceLogActivity('agents', nothingSelected)).toBe(false);
  expect(needsWorkspaceLogActivity('reviews', nothingSelected)).toBe(false);
  expect(
    needsWorkspaceLogActivity('agents', { ...nothingSelected, agent: 'identity-strand' }),
  ).toBe(true);
  expect(needsWorkspaceLogActivity('agents', { ...nothingSelected, agentRun: 'run' })).toBe(true);
  expect(needsWorkspaceLogActivity('reviews', { ...nothingSelected, issue: 'card' })).toBe(true);
  expect(logActivityOptions('workspace', false)).toMatchObject({
    enabled: false,
    refetchInterval: false,
  });
});
