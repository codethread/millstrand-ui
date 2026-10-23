import { beforeEach, expect, it, vi } from 'vitest';
import type { Card } from '../shared/api';
import type { LinkedSource } from './linked-cards';
import { StrandData } from './strand';

const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

beforeEach(() => {
  exec.mockReset();
  exec.mockImplementation((_file, argv) => {
    const op = Array.isArray(argv) ? argv.slice(2) : [];
    if (op[0] === 'help' && op[1] === 'kanban') return Promise.resolve({ stdout: 'kanban help' });
    throw new Error(`Unexpected command ${JSON.stringify(op)}`);
  });
});

const repo = '/work/repo/.millstrand';

// The coordinator's stored mirror, as `kanban link add` persists it.
const mirror = {
  id: 'm1',
  title: 'Stored title',
  state: 'active',
  created_at: '2026-10-23 10:00:00',
  updated_at: '2026-10-23 10:00:00',
  attributes: {
    'kanban/card': 'true',
    'kanban/lane': 'pending',
    'kanban/priority': 'p1',
    'kanban.label/portfolio': 'true',
    'kanban/link': { workspace: repo, card: 'd1' },
    'kanban/link-snapshot': {
      title: 'Stored title',
      state: 'active',
      lane: 'pending',
      owner: 'old-owner',
      'observed-at': '2026-10-23T10:00:00Z',
    },
  },
};

function coordinator(source: LinkedSource) {
  const database = {
    readDependencies: vi.fn(async () => ({ rootId: '', nodes: [], edges: [] })),
    readNoteProvenance: vi.fn(async () => ({ strands: [], edges: [] })),
    readLogProvenance: vi.fn(async () => ({ strands: [], edges: [] })),
    readProvenance: vi.fn(async () => ({ strands: [mirror], edges: [] })),
  };
  const linkedSource = vi.fn(async () => source);
  return {
    strand: new StrandData('/work/workfiles/.millstrand', { database, linkedSource }),
    linkedSource,
  };
}

function downstream(card: Partial<Card> & { id: string }): Card {
  return {
    title: 'Downstream',
    type: 'feature',
    state: 'active',
    lane: 'pending',
    priority: 'p3',
    epicId: null,
    dependencies: { incoming: 0, outgoing: 0 },
    owner: null,
    reporter: null,
    ownership: { current: null, history: [] },
    branch: null,
    worktree: null,
    source: null,
    outcome: null,
    labels: [],
    externalRefs: [],
    autoRun: null,
    link: null,
    createdAt: '2026-10-23 09:00:00',
    updatedAt: null,
    ...card,
  };
}

const target = { workspace: repo, workspaceId: 'repo-id', workspaceName: 'repo', card: 'd1' };

it('shows the downstream card by its linked ID, keeping coordinator annotations', async () => {
  const { strand, linkedSource } = coordinator({
    kind: 'available',
    workspaceId: 'repo-id',
    workspaceName: 'repo',
    cards: [
      // Same ID as the mirror on another board: must not be mistaken for the link target.
      downstream({ id: 'm1', title: 'Unrelated lookalike', lane: 'in_review' }),
      downstream({ id: 'd1', title: 'Live title', lane: 'claimed', owner: 'lemur', branch: 'b' }),
    ],
  });

  const board = await strand.board();

  expect(linkedSource).toHaveBeenCalledWith(repo);
  expect(board.cards).toEqual([
    expect.objectContaining({
      id: 'm1',
      title: 'Live title',
      lane: 'claimed',
      owner: 'lemur',
      branch: 'b',
      priority: 'p1',
      labels: ['portfolio'],
      link: { status: 'live', target },
    }),
  ]);
  expect(board.summary).toMatchObject({ active: 1, inProgress: 1, ready: 0 });
});

it('treats a downstream closure as closed on the coordinator board', async () => {
  const { strand } = coordinator({
    kind: 'available',
    workspaceId: 'repo-id',
    workspaceName: 'repo',
    cards: [downstream({ id: 'd1', state: 'closed', lane: 'closed', outcome: 'done' })],
  });

  const board = await strand.board();

  expect(board.cards[0]).toMatchObject({ state: 'closed', lane: 'closed', outcome: 'done' });
  expect(board.summary).toMatchObject({ active: 0, closed: 1, done: 1 });
});

it.each<[string, LinkedSource, string]>([
  [
    'an unreachable source',
    { kind: 'unavailable', workspaceId: 'repo-id', workspaceName: 'repo', reason: 'Offline.' },
    'Offline.',
  ],
  [
    'a source without the card',
    { kind: 'available', workspaceId: 'repo-id', workspaceName: 'repo', cards: [] },
    'Card d1 is not on the repo board.',
  ],
])('keeps the honest stored mirror for %s', async (_name, source, reason) => {
  const { strand } = coordinator(source);

  const [card] = (await strand.board()).cards;

  expect(card).toMatchObject({
    title: 'Stored title',
    lane: 'pending',
    owner: 'old-owner',
    link: { status: 'unavailable', target, reason, observedAt: '2026-10-23T10:00:00Z' },
  });
});

it('refuses to move a mirror because its lane belongs to the downstream board', async () => {
  const { strand } = coordinator({
    kind: 'available',
    workspaceId: 'repo-id',
    workspaceName: 'repo',
    cards: [downstream({ id: 'd1' })],
  });

  await expect(strand.changeCard('m1', { kind: 'move', lane: 'claimed' })).rejects.toThrow(
    'move it on that board',
  );
  expect(exec.mock.calls.map(([, argv]) => argv)).not.toContainEqual(
    expect.arrayContaining(['update']),
  );
});
