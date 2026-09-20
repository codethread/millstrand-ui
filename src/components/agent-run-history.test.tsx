import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { AgentIdentity, AgentRun } from '../../shared/api';
import { AgentRunHistory } from './agent-run-history';

vi.mock('../lib/navigation', () => ({
  useDashboardActions: () => ({ focusAgentRun: vi.fn() }),
}));
vi.mock('./agent-run-reply', () => ({ AgentRunReply: () => null }));

const run: AgentRun = {
  id: 'completed-run',
  requestId: null,
  title: 'Completed task work',
  alias: 'worker',
  harness: 'pi',
  status: 'stopped',
  substatus: 'completed',
  mode: 'headless',
  model: null,
  effort: null,
  cwd: null,
  target: 'task',
  rootTargets: ['card'],
  participants: [
    { identity: 'first-worker', status: 'resolved', identityStrandIds: ['first'] },
    { identity: 'raw-worker', status: 'ambiguous', identityStrandIds: [] },
  ],
  continuation: { kind: 'fresh-retry', predecessorRunId: 'earlier-run' },
  createdAt: '2026-09-01T12:00:00Z',
  startedAt: null,
  finishedAt: '2026-09-01T13:00:00Z',
};

function identity(runs: AgentRun[]): AgentIdentity {
  return {
    id: 'worker',
    strandId: 'worker-id',
    harness: 'pi',
    model: null,
    effort: null,
    createdAt: '2026-09-01T12:00:00Z',
    runs,
    work: [],
  };
}

it('keeps terminal runs and every published participant inspectable', () => {
  const html = renderToStaticMarkup(
    <AgentRunHistory identity={identity([run])} selectedRunId={null} stale={false} />,
  );
  expect(html).toContain('Completed task work');
  expect(html).toContain('first-worker, Ambiguous identity: raw-worker');
  expect(html).toContain('Fresh retry of');
  expect(html).toContain('earlier-run');
});

it('makes an absent run history explicit', () => {
  expect(
    renderToStaticMarkup(
      <AgentRunHistory identity={identity([])} selectedRunId={null} stale={false} />,
    ),
  ).toContain('No published tracked runs');
});
