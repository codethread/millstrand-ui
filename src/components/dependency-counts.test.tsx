import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CardDependencyCounts } from './dependency-counts';

it('exposes the meaning of compact arrows without hiding zero counts', () => {
  const html = renderToStaticMarkup(<CardDependencyCounts counts={{ outgoing: 4, incoming: 0 }} />);
  expect(html).toContain('aria-label="Dependencies: depends on 4, required by 0"');
  expect(html).toContain('↑ Depends on · ↓ Required by');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('>4</span>');
  expect(html).toContain('>0</span>');
});
