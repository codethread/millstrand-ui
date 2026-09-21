import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { AgentReply, LaunchRefusal } from '../../shared/api';
import { AgentRunReply } from './agent-run-reply';

const reply: AgentReply = {
  id: 'run1',
  title: 'card1 · Work',
  alias: 'worker',
  identity: 'calm-tiger',
  target: 'card1',
  status: 'ready',
  substatus: 'pending',
  result: null,
  error: null,
  prompt: { kind: 'card', cardId: 'card1', text: 'Help with this card' },
};

const refusal = vi.hoisted(() => ({ value: null as LaunchRefusal | null }));
vi.mock('../hooks/use-agents', () => ({
  useAgentReply: () => ({ data: reply }),
  useRunLaunchRefusal: () => ({ data: refusal.value }),
}));
vi.mock('../hooks/use-cards', () => ({ useBoard: () => ({ data: { cards: [] } }) }));
vi.mock('../lib/navigation', () => ({
  useWorkspaceId: () => 'weaver',
  useDashboardActions: () => ({ exploreGraph: vi.fn(), openCard: vi.fn(), openReview: vi.fn() }),
}));

it('describes an ordinary queued run as waiting for its agent to start', () => {
  refusal.value = null;
  expect(renderToStaticMarkup(<AgentRunReply id="run1" />)).toContain(
    'Queued · waiting for the agent to start.',
  );
});

it('never describes a graph-blocked queue as waiting to start', () => {
  refusal.value = { kind: 'blocked', blockers: [{ id: 'dep1', lane: 'refinement' }] };
  const html = renderToStaticMarkup(<AgentRunReply id="run1" />);
  expect(html).toContain('Blocked by active dependencies: dep1 (refinement).');
  expect(html).toContain('The run cannot start until that changes.');
  expect(html).not.toContain('waiting for the agent to start');
});
