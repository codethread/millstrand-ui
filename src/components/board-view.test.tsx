import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { parseCard } from '../../server/parse';
import { emptyProvenance } from '../../server/provenance';
import type { AgentDirectory, Card } from '../../shared/api';
import { agentQueryOptions } from '../lib/api/agents';
import { emptyFilter, issueSurfaceContent } from '../lib/board';
import { BoardView, OutlineView } from './board-view';
import { TooltipProvider } from './ui/tooltip';

vi.mock('../lib/navigation', () => ({
  useDashboardActions: () => ({ openCard: vi.fn(), toggleLabel: vi.fn() }),
  useIssueFilter: () => emptyFilter(),
}));
vi.mock('../hooks/use-workspace', () => ({ useWorkspace: () => null }));

function card(id: string, attributes: Record<string, string> = {}): Card {
  return parseCard(
    {
      id,
      title: `Title ${id}`,
      state: 'active',
      created_at: '2026-09-29',
      attributes: { 'kanban/type': 'feature', 'kanban/lane': 'pending', ...attributes },
    },
    emptyProvenance(),
  );
}

function render(cards: Card[], outline: boolean, failed = false) {
  const client = new QueryClient();
  const options = agentQueryOptions(null);
  const directory: AgentDirectory = {
    workspace: { path: '/workspace', name: 'Workspace' },
    fetchedAt: '2026-09-29T10:00:00Z',
    identities: [],
    runs: [],
  };
  client.setQueryData(options.queryKey, directory);
  if (failed)
    client
      .getQueryCache()
      .find({ queryKey: options.queryKey })
      ?.setState({ status: 'error', error: new Error('Disconnected') });
  const model = issueSurfaceContent(cards, emptyFilter());
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {outline ? <OutlineView groups={model.outline} /> : <BoardView columns={model.columns} />}
      </TooltipProvider>
    </QueryClientProvider>,
  );
  client.clear();
  return html;
}

it.each([false, true])(
  'keeps real card actions, labels and meaningful auto signals in compact layouts (outline=%s)',
  (outline) => {
    const epic = card('epic', { 'kanban/type': 'epic', 'kanban.label/parent-label': 'true' });
    const child = {
      ...card('child', {
        'kanban.label/long-readable-label': 'true',
        'kanban.label/auto-run': 'true',
      }),
      epicId: epic.id,
    };
    const html = render([epic, child], outline);
    for (const title of [epic.title, child.title]) {
      expect(html).toContain(`aria-label="Open ${title}"`);
      expect(html).toContain(`aria-label="Actions for ${title}"`);
    }
    expect(html).toContain('Filter by label long-readable-label');
    expect(html).toContain('Filter by label parent-label');
    expect(html).toContain('Auto on details');
    expect(html).toContain('Dependencies: depends on 0, required by 0');
    expect(html).not.toMatch(/No activity|Auto off|Activity loading/);
    expect(html).toContain('Priority ');
    expect(html).not.toMatch(/<span[^>]*aria-label=/);
  },
);

it('does not hide unavailable activity as an empty successful signal', () => {
  expect(render([card('card')], false, true)).toContain('Activity unavailable details');
});
