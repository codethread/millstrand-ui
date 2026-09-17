import { beforeEach, expect, it, vi } from 'vitest';
import { parseCardLane, moveCardArgs } from './card-actions';
import { requestValue } from './parse';
import { StrandData } from './strand';

const exec = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ stdout: string }>>());
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
};
function mockBoard() {
  let cards = [card];
  exec.mockImplementation(async (_file, argv) => {
    const op = Array.isArray(argv) ? argv.slice(2) : [];
    if (op[0] === 'kanban' && op[1] === 'board') return { stdout: JSON.stringify({ cards }) };
    if (op[0] === 'list' && op[1] === '--query') return { stdout: JSON.stringify(cards) };
    if (op[0] === 'burn') {
      cards = [];
      return { stdout: '{"burned":["card1"],"count":1}' };
    }
    if (op[0] === 'update') {
      cards = [{ ...card, lane: 'in_review' }];
      return { stdout: '{}' };
    }
    throw new Error(`Unexpected command ${JSON.stringify(op)}`);
  });
  return {
    remove: () => {
      cards = [];
    },
  };
}

it('deletes only the selected card in its workspace and refreshes a cached board', async () => {
  mockBoard();
  const data = new StrandData('/repo/.millstrand');
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
  const data = new StrandData('/repo/.millstrand');
  await data.board();
  source.remove();
  await expect(data.changeCard('card1', { kind: 'delete' })).rejects.toMatchObject({ status: 404 });
  expect(
    exec.mock.calls.every((call) => {
      const args = call[1];
      return Array.isArray(args) && (args.includes('board') || args.includes('kanban-cards'));
    }),
  ).toBe(true);
});
it('moves the card without touching children or assignment attributes', async () => {
  mockBoard();
  const data = new StrandData('/repo/.millstrand');
  await data.changeCard('card1', { kind: 'move', lane: 'in_review' });
  expect(exec.mock.calls.at(-1)?.[1]).toEqual([
    '--workspace',
    '/repo/.millstrand',
    ...moveCardArgs('card1', 'in_review'),
  ]);
  expect((await data.board()).cards[0]?.lane).toBe('in_review');
});
it('invalidates the board even when the command fails after a possible side effect', async () => {
  mockBoard();
  const data = new StrandData('/repo/.millstrand');
  await data.board();
  // Validation now reads the compact board and the authoritative card attributes.
  exec.mockResolvedValueOnce({ stdout: JSON.stringify({ cards: [card] }) });
  exec.mockResolvedValueOnce({ stdout: JSON.stringify([card]) });
  exec.mockRejectedValueOnce(new Error('Timeout'));
  await expect(data.changeCard('card1', { kind: 'delete' })).rejects.toThrow('Timeout');
  exec.mockResolvedValueOnce({ stdout: '{"cards":[]}' });
  expect((await data.board()).cards).toEqual([]);
});
