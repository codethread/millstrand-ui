import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { AgentRun } from '../../shared/api';
import type { CardLogAgent } from '../lib/agent-logs';
import { CardAgentRoster } from './card-agent-roster';

vi.mock('../lib/navigation', () => ({
  useDashboardActions: () => ({ openAgentRun: vi.fn() }),
}));

const taskOwner: CardLogAgent = {
  kind: 'identity',
  identity: {
    id: 'task-worker',
    strandId: 'identity',
    harness: 'pi',
    model: null,
    effort: null,
    parentIdentityStrandIds: [],
    createdAt: '2026-09-18',
    runs: [],
    work: [],
  },
  run: null,
  relation: 'task-owner',
  tasks: [{ id: 'task', title: 'Improve the agent roster', state: 'active', owner: 'task-worker' }],
  group: 'current',
};

it('renders named selectable rows and a narrow selector without implying ownership is execution', () => {
  const html = renderToStaticMarkup(
    <CardAgentRoster
      agents={[taskOwner]}
      selected={taskOwner}
      choose={() => {}}
      historyCount={2}
      showHistory={false}
      setShowHistory={() => {}}
    />,
  );
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-label="Activity agent"');
  expect(html).toContain('value="identity" selected');
  expect(html).toContain('Task owner · Improve the agent roster');
  expect(html).toContain('Untracked');
  expect(html).toContain('Ownership only · activity on this work is not confirmed');
  expect(html).toContain('Card participation');
  expect(html).toContain('Current participation');
  expect(html).toContain('Past participation (2)');
  expect(html).toContain('aria-expanded="false"');
});

it('renders a pre-binding targeted run without inventing an identity', () => {
  const run: AgentRun = {
    id: 'pre-binding',
    requestId: null,
    title: 'Pending native callback',
    alias: 'sol',
    harness: 'pi',
    status: 'running',
    substatus: null,
    mode: 'headless',
    model: null,
    effort: null,
    cwd: '/workspace',
    ownership: null,
    target: 'task',
    rootTargets: ['card'],
    participants: [],
    session: { provider: 'pi', session: 'session-1' },
    continuation: null,
    createdAt: '2026-09-24',
    startedAt: null,
    finishedAt: null,
  };
  const pending: CardLogAgent = {
    kind: 'run',
    identity: null,
    run,
    relation: 'target',
    tasks: [],
    group: 'current',
  };
  const html = renderToStaticMarkup(
    <CardAgentRoster
      agents={[pending]}
      selected={pending}
      choose={() => {}}
      historyCount={0}
      showHistory={false}
      setShowHistory={() => {}}
    />,
  );
  expect(html).toContain('Identity registration pending');
  expect(html).toContain('Linked run · identity registration pending');
  expect(html).toContain('Inspect run pre-binding');
  expect(html).not.toContain('Feature owner');
});
