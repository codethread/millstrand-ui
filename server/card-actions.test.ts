import { beforeEach, expect, it, vi } from 'vitest';
import { parseCardLane, moveCardArgs } from './card-actions';
import { requestValue } from './parse';
import { StrandData } from './strand';

const { exec, send } = vi.hoisted(() => ({
  exec: vi.fn(),
  send: vi.fn(),
}));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});
beforeEach(() => {
  exec.mockReset();
  send.mockReset();
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
function cardRead(cards: (typeof card)[]) {
  return Object.assign(Promise.resolve({ stdout: JSON.stringify(JSON.stringify(cards)) }), {
    child: { stdin: { end: send } },
  });
}

function mockBoard() {
  let cards = [card];
  exec.mockImplementation((_file, argv) => {
    if (_file === 'mill') return cardRead(cards);
    const op = Array.isArray(argv) ? argv.slice(2) : [];
    if (op[0] === 'kanban' && op[1] === 'board')
      return Promise.resolve({ stdout: JSON.stringify({ cards }) });
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
      return (
        (call[0] === 'mill' &&
          JSON.stringify(args) ===
            JSON.stringify(['weaver', 'repl', '--workspace', '/repo/.millstrand', '--stdin'])) ||
        (call[0] === 'strand' && Array.isArray(args) && args.includes('board'))
      );
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
  // Validation reads the compact board, then hydrates it before the mutation times out.
  exec.mockResolvedValueOnce({ stdout: JSON.stringify({ cards: [card] }) });
  exec.mockReturnValueOnce(cardRead([card]));
  exec.mockRejectedValueOnce(new Error('Timeout'));
  await expect(data.changeCard('card1', { kind: 'delete' })).rejects.toThrow('Timeout');
  exec.mockResolvedValueOnce({ stdout: '{"cards":[]}' });
  expect((await data.board()).cards).toEqual([]);
});
