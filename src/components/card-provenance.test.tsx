import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { Card } from '../../shared/api';
import { CardProvenance } from './card-provenance';

const card: Card = {
  id: 'card',
  title: 'Ownership history',
  type: 'feature',
  state: 'active',
  lane: 'claimed',
  priority: 'p2',
  epicId: null,
  dependencies: { incoming: 0, outgoing: 0 },
  owner: 'alpha',
  reporter: { identity: 'reporter', status: 'resolved', identityStrandIds: ['reporter-id'] },
  ownership: {
    current: {
      id: 'third',
      owner: { identity: 'alpha', status: 'unresolved', identityStrandIds: [] },
      actor: null,
      claimedAt: '2026-09-03T12:00:00Z',
      order: 3,
      branch: null,
      worktree: null,
      runId: null,
    },
    history: [
      {
        id: 'third',
        owner: { identity: 'alpha', status: 'unresolved', identityStrandIds: [] },
        actor: null,
        claimedAt: '2026-09-03T12:00:00Z',
        order: 3,
        branch: null,
        worktree: null,
        runId: null,
      },
      {
        id: 'first',
        owner: { identity: 'alpha', status: 'resolved', identityStrandIds: ['alpha-id'] },
        actor: null,
        claimedAt: '2026-09-01T12:00:00Z',
        order: 1,
        branch: null,
        worktree: null,
        runId: null,
      },
      {
        id: 'second',
        owner: { identity: 'beta', status: 'resolved', identityStrandIds: ['beta-id'] },
        actor: null,
        claimedAt: '2026-09-02T12:00:00Z',
        order: 2,
        branch: null,
        worktree: null,
        runId: null,
      },
    ],
  },
  branch: null,
  worktree: null,
  source: null,
  outcome: null,
  labels: [],
  autoRun: null,
  createdAt: '2026-09-01T12:00:00Z',
  updatedAt: null,
};

it('renders reporter separately from ordered A→B→A ownership, including an unresolved current owner', () => {
  const html = renderToStaticMarkup(<CardProvenance card={card} />);
  expect(html).toContain('Reporter');
  expect(html).toContain('reporter');
  expect(html).toContain('Current owner');
  expect(html).toContain('Unresolved identity: alpha');
  expect(html.indexOf('Sep 1, 2026')).toBeLessThan(html.indexOf('Sep 2, 2026'));
  expect(html.indexOf('Sep 2, 2026')).toBeLessThan(html.indexOf('Sep 3, 2026'));
});

it('renders explicit no-data ownership states', () => {
  const html = renderToStaticMarkup(
    <CardProvenance
      card={{ ...card, reporter: null, ownership: { current: null, history: [] } }}
    />,
  );
  expect(html).toContain('No durable reporter recorded');
  expect(html).toContain('Unassigned');
  expect(html).toContain('No explicit ownership claim has been recorded');
});
