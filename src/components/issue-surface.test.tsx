import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { emptyFilter } from '../lib/board';
import type { Presentation } from '../lib/dashboard-search';
import { IssueSurface } from './issue-surface';

const navigation = vi.hoisted(() => ({ mode: 'board' as Presentation }));
vi.mock('../lib/navigation', () => ({
  useDashboardMode: () => navigation.mode,
  useDashboardActions: () => ({ resetFilters: vi.fn() }),
  useIssueFilter: () => emptyFilter(),
}));
vi.mock('../hooks/use-cards', () => ({
  useIssueBoard: () => ({ data: { cards: [], allCards: [] } }),
}));
vi.mock('./graph-view', () => ({
  default: () => (
    <select aria-label="Graph focus">
      <option>All filtered issues</option>
    </select>
  ),
}));

it('keeps graph focus available with no matching cards, while board and outline show empty states', async () => {
  for (const mode of ['board', 'outline'] as const) {
    navigation.mode = mode;
    expect(renderToStaticMarkup(<IssueSurface />)).toContain('No issues match this view');
  }
  navigation.mode = 'graph';
  const stream = await renderToReadableStream(<IssueSurface />);
  await stream.allReady;
  const html = await new Response(stream).text();
  expect(html).toContain('Graph focus');
  expect(html).not.toContain('No issues match this view');
});
