import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { CardLogAgent } from '../lib/agent-logs';
import { CardAgentRoster } from './card-agent-roster';

vi.mock('../lib/navigation', () => ({
  useDashboardActions: () => ({ openAgentRun: vi.fn() }),
}));

const taskOwner: CardLogAgent = {
  identity: {
    id: 'task-worker',
    strandId: 'identity',
    harness: 'pi',
    model: null,
    effort: null,
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
