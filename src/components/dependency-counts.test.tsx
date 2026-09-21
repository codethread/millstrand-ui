import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CardDependencyCounts, GraphDependencyCounts } from './dependency-counts';

it('exposes the meaning of compact arrows without hiding zero counts', () => {
  const html = renderToStaticMarkup(<CardDependencyCounts counts={{ outgoing: 4, incoming: 0 }} />);
  expect(html).toContain('aria-label="Dependencies: depends on 4, required by 0"');
  expect(html).toContain('↑ Depends on · ↓ Required by');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('>4</span>');
  expect(html).toContain('>0</span>');
});

it.each([false, true])(
  'renders graph count expansion state expanded=%s without opening a popover',
  (expanded) => {
    const html = renderToStaticMarkup(
      <GraphDependencyCounts
        id="card"
        counts={{ outgoing: 4, incoming: 1 }}
        expanded={expanded}
        onToggle={() => {}}
      />,
    );
    expect(html).toContain(`aria-pressed="${expanded}"`);
    expect(html).toContain(
      `aria-label="${expanded ? 'Hide' : 'Show'} dependencies for card: depends on 4, required by 1"`,
    );
    expect(html).toContain('>4</span>');
    expect(html).toContain('>1</span>');
    expect(html).not.toContain('aria-haspopup');
  },
);

const renderEmptyGraphCounts = (expanded: boolean) =>
  renderToStaticMarkup(
    <GraphDependencyCounts
      id="card"
      counts={{ outgoing: 0, incoming: 0 }}
      expanded={expanded}
      onToggle={() => {}}
    />,
  );

it('disables empty expansion but still allows an expanded zero-count card to collapse', () => {
  expect(renderEmptyGraphCounts(false)).toContain('disabled=""');
  expect(renderEmptyGraphCounts(true)).not.toContain('disabled=""');
});
