import { beforeEach, expect, it, vi } from 'vitest';
import { parseCardLane, moveCardArgs } from './card-actions';
import { requestValue } from './parse';
import { StrandData } from './strand';

const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

beforeEach(() => {
  exec.mockReset();
});

it.each(['unknown', '--help', '', null, 3])('rejects invalid destination %s', (lane) => {
  expect(() => requestValue(parseCardLane, { lane })).toThrow('Choose a known destination lane');
});
it.each(['refinement', 'pending', 'claimed', 'in_review', 'in_production', 'closed'])(
  'accepts %s and updates state and lane together',
  (lane) => {
    const parsed = parseCardLane({ lane });
    const args = moveCardArgs('card1', parsed);
    expect(args.slice(0, 5)).toEqual([
      'update',
      'card1',
      '--state',
      lane === 'closed' ? 'closed' : 'active',
      '--attributes',
    ]);
    expect(JSON.parse(args[5]!)).toEqual({
      'kanban/lane': lane === 'closed' ? null : lane,
      'kanban/outcome': lane === 'closed' ? 'done' : null,
      'kanban/closed-by': null,
      'kanban/abandon-restore-lane': null,
    });
  },
);

const card = {
  id: 'card1',
  title: 'Card',
  state: 'active',
  lane: 'pending',
  created_at: '2026-09-15',
  updated_at: '2026-09-15',
};

function mockBoard() {
  let cards = [card];
  exec.mockImplementation((_file, argv) => {
    const op = Array.isArray(argv) ? argv.slice(2) : [];
    if (op[0] === 'help' && op[1] === 'kanban') return Promise.resolve({ stdout: 'kanban help' });
    if (op[0] === 'burn') {
      cards = [];
      return Promise.resolve({ stdout: '{"burned":["card1"],"count":1}' });
    }
    if (op[0] === 'update') {
      cards = [{ ...card, lane: 'in_review' }];
      return Promise.resolve({ stdout: '{}' });
    }
    throw new Error(`Unexpected command ${JSON.stringify(op)}`);
  });
  const database = {
    readDependencies: vi.fn(async () => ({ rootId: '', nodes: [], edges: [] })),
    readNoteProvenance: vi.fn(async () => ({ strands: [], edges: [] })),
    readLogProvenance: vi.fn(async () => ({ strands: [], edges: [] })),
    readProvenance: vi.fn(async () => ({
      strands: cards.map((item) => ({
        ...item,
        attributes: { 'kanban/card': 'true', 'kanban/lane': item.lane },
      })),
      edges: [],
    })),
  };
  return {
    database,
    remove: () => {
      cards = [];
    },
  };
}

it('keeps completed counts and epic context while omitting other completed cards', async () => {
  exec.mockResolvedValue({ stdout: 'kanban help' });
  const closed = {
    ...card,
    id: 'closed1',
    title: 'Closed',
    state: 'closed',
    lane: 'closed',
    outcome: 'done',
  };
  const closedEpic = { ...closed, id: 'epic1', title: 'Epic' };
  const database = {
    readDependencies: vi.fn(async () => ({ rootId: '', nodes: [], edges: [] })),
    readNoteProvenance: vi.fn(async () => ({ strands: [], edges: [] })),
    readLogProvenance: vi.fn(async () => ({ strands: [], edges: [] })),
    readProvenance: vi.fn(async () => ({
      strands: [card, closed, closedEpic].map((item) => ({
        ...item,
        attributes: {
          'kanban/card': 'true',
          'kanban/lane': item.lane,
          ...(item.id === 'epic1' ? { 'kanban/type': 'epic' } : {}),
          ...(item.id === 'card1' ? {} : { 'kanban/outcome': 'done' }),
        },
      })),
      edges: [{ edge_type: 'parent-of', from_strand_id: 'epic1', to_strand_id: 'card1' }],
    })),
  };
  const data = new StrandData('/repo/.millstrand', { database });

  expect(await data.board(false)).toMatchObject({
    cards: [{ id: 'card1', epicId: 'epic1' }, { id: 'epic1' }],
    summary: { active: 1, ready: 1, closed: 2, done: 2 },
  });
  expect((await data.board()).cards.map((item) => item.id)).toEqual(['card1', 'closed1', 'epic1']);
  expect(database.readProvenance).toHaveBeenCalledTimes(1);
});

it('deletes only the selected card in its workspace and refreshes a cached board', async () => {
  const { database } = mockBoard();
  const data = new StrandData('/repo/.millstrand', { database });
  await data.board();
  await data.changeCard('card1', { kind: 'delete' });
  expect(exec.mock.calls.map((call) => call[1])).toContainEqual([
    '--workspace',
    '/repo/.millstrand',
    'burn',
    'card1',
  ]);
  expect((await data.board()).cards).toEqual([]);
});
it('does not mutate a non-card or a card removed since the last poll', async () => {
  const source = mockBoard();
  const data = new StrandData('/repo/.millstrand', { database: source.database });
  await data.board();
  source.remove();
  await expect(data.changeCard('card1', { kind: 'delete' })).rejects.toMatchObject({ status: 404 });
  expect(
    exec.mock.calls.every((call) => {
      const args = call[1];
      return (
        call[0] === 'strand' && Array.isArray(args) && args[2] === 'help' && args[3] === 'kanban'
      );
    }),
  ).toBe(true);
});
it('moves only the card and invalidates cached dependency metadata', async () => {
  const { database } = mockBoard();
  const data = new StrandData('/repo/.millstrand', { database });
  await data.dependencies();
  await data.changeCard('card1', { kind: 'move', lane: 'in_review' });
  await data.dependencies();
  expect(database.readDependencies).toHaveBeenCalledTimes(2);
  expect(exec.mock.calls.at(-1)?.[1]).toEqual([
    '--workspace',
    '/repo/.millstrand',
    ...moveCardArgs('card1', 'in_review'),
  ]);
  expect((await data.board()).cards[0]?.lane).toBe('in_review');
});
it('invalidates the board even when the command fails after a possible side effect', async () => {
  const { database } = mockBoard();
  const data = new StrandData('/repo/.millstrand', { database });
  await data.board();
  await data.dependencies();
  // Validation re-reads the persisted snapshot before the mutation times out.
  database.readProvenance.mockResolvedValueOnce({
    strands: [{ ...card, attributes: { 'kanban/card': 'true', 'kanban/lane': card.lane } }],
    edges: [],
  });
  exec.mockRejectedValueOnce(new Error('Timeout'));
  await expect(data.changeCard('card1', { kind: 'delete' })).rejects.toThrow('Timeout');
  await data.dependencies();
  expect(database.readDependencies).toHaveBeenCalledTimes(2);
  expect(database.readProvenance).toHaveBeenCalledTimes(2);
  database.readProvenance.mockResolvedValueOnce({ strands: [], edges: [] });
  expect((await data.board()).cards).toEqual([]);
  expect(database.readProvenance).toHaveBeenCalledTimes(3);
});
