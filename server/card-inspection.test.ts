import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand';

const { exec, send } = vi.hoisted(() => ({ exec: vi.fn(), send: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

function hydrated(value: unknown) {
  return Object.assign(Promise.resolve({ stdout: JSON.stringify(JSON.stringify(value)) }), {
    child: { stdin: { end: send } },
  });
}

beforeEach(() => {
  exec.mockReset();
  send.mockReset();
});

const card = { id: 'card1', title: 'Card', state: 'active', created_at: '2026-09-17' };

it('reads membership before bounded full hydration and retains long dispatch errors', async () => {
  const error = 'Delivery preparation failed. '.repeat(100);
  exec.mockImplementation((file) => {
    if (file === 'strand') return Promise.resolve({ stdout: JSON.stringify({ cards: [card] }) });
    return hydrated([{ ...card, attributes: { 'auto-run/error': error } }]);
  });
  const workspace = '/repo/"(throw (Exception.))/.millstrand';
  const data = new StrandData(workspace);
  const board = await data.board();
  expect(board.cards[0]?.autoRun?.error).toBe(error);
  expect(exec.mock.calls.map((call) => call[0])).toEqual(['strand', 'mill']);
  expect(exec.mock.calls[1]?.[1]).toEqual(['weaver', 'repl', '--workspace', workspace, '--stdin']);
  const source: unknown = send.mock.calls[0]?.[0];
  expect(source).toEqual(expect.stringContaining('[:attr "kanban/card"] "true"] {} 10000'));
  expect(source).toEqual(
    expect.stringContaining(
      'millstrand.api.weaver.alpha/list runtime [:in :id (mapv :id cards)] {}',
    ),
  );
  expect(source).toEqual(expect.stringContaining('(if (seq cards)'));
  expect(source).not.toEqual(expect.stringContaining('strands-by-ids'));
  expect(source).not.toEqual(expect.stringContaining(workspace));
  expect(await data.board()).toBe(board);
  expect(exec).toHaveBeenCalledTimes(2);
});

it('omits a deleted card without rejecting its surviving peers', async () => {
  exec.mockImplementation((file) =>
    file === 'strand'
      ? Promise.resolve({ stdout: JSON.stringify({ cards: [card, { ...card, id: 'deleted' }] }) })
      : hydrated([card]),
  );
  expect((await new StrandData('/repo/.millstrand').board()).cards.map(({ id }) => id)).toEqual([
    'card1',
  ]);
});

it('reports hydration failures rather than claiming cards have no configuration', async () => {
  exec.mockImplementationOnce(() => Promise.resolve({ stdout: JSON.stringify({ cards: [card] }) }));
  exec.mockImplementationOnce(() =>
    Object.assign(Promise.reject(new Error('Matching-row cap exceeded')), {
      child: { stdin: { end: send } },
    }),
  );
  await expect(new StrandData('/repo/.millstrand').board()).rejects.toMatchObject({ status: 502 });
});
