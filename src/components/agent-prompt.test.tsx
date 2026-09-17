import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PromptAgentButton } from './agent-prompt';

const navigation = vi.hoisted(() => ({ workspace: null as string | null }));
vi.mock('../lib/navigation', () => ({
  useWorkspaceId: () => navigation.workspace,
  useDashboardActions: () => ({ openAgentRun: vi.fn() }),
}));

it('uses the same review prompt button and disables it until a weaver is discovered', () => {
  const target = { kind: 'review' as const, cardId: 'review1', id: 'review1', title: 'Review' };
  navigation.workspace = null;
  const waiting = renderToStaticMarkup(<PromptAgentButton target={target} />);
  expect(waiting).toContain('Prompt agent');
  expect(waiting).toContain('disabled=""');
  navigation.workspace = 'weaver';
  expect(renderToStaticMarkup(<PromptAgentButton target={target} />)).not.toContain('disabled=""');
});
