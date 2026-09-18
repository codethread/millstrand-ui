import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GraphEmpty, GraphSourceNotice } from './graph-view';

it('distinguishes pending, unavailable and retained graph failures from successful empty data', () => {
  expect(renderToStaticMarkup(<GraphSourceNotice source={{ kind: 'loading' }} />)).toContain(
    'Mapping this issue',
  );
  const unavailable = renderToStaticMarkup(
    <GraphSourceNotice source={{ kind: 'unavailable', error: new Error('Offline') }} />,
  );
  expect(unavailable).toContain('Offline');
  expect(unavailable).not.toContain('No relationships');
  expect(unavailable).not.toContain('last-known');
  const retained = renderToStaticMarkup(
    <GraphSourceNotice
      source={{
        kind: 'ready',
        graph: { rootId: 'root', nodes: [], edges: [] },
        error: new Error('Refresh failed'),
      }}
    />,
  );
  expect(retained).toContain('Refresh failed');
  expect(retained).toContain('Showing last-known graph');
  expect(renderToStaticMarkup(<GraphEmpty layout={{ kind: 'empty' }} />)).toContain(
    'No relationships to show',
  );
  const large = renderToStaticMarkup(<GraphEmpty layout={{ kind: 'too-large', count: 151 }} />);
  expect(large).toContain('151 nodes');
  expect(large).toContain('limited to 150 nodes');
});
