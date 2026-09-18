import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand';

const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

const readCardStrands = vi.fn();
const database = {
  readAgentStrands: vi.fn(),
  readCardStrands,
};

beforeEach(() => {
  exec.mockReset();
  readCardStrands.mockReset();
  database.readAgentStrands.mockReset();
});

const card = {
  id: 'card1',
  title: 'Card',
  state: 'active',
  created_at: '2026-09-17',
  updated_at: '2026-09-17',
};

it('reads domain membership before bounded persisted hydration and retains long dispatch errors', async () => {
  const error = 'Delivery preparation failed. '.repeat(100);
  exec.mockResolvedValue({ stdout: JSON.stringify({ cards: [card] }) });
  readCardStrands.mockResolvedValue([{ ...card, attributes: { 'auto-run/error': error } }]);
  const data = new StrandData('/repo/.millstrand', database);
  const board = await data.board();
  expect(board.cards[0]?.autoRun?.error).toBe(error);
  expect(exec).toHaveBeenCalledTimes(1);
  expect(exec.mock.calls[0]?.slice(0, 2)).toEqual([
    'strand',
    ['--workspace', '/repo/.millstrand', 'kanban', 'board', '--all', 'true'],
  ]);
  expect(readCardStrands).toHaveBeenCalledTimes(1);
  expect(await data.board()).toBe(board);
});

it('omits a deleted card without rejecting its surviving peers', async () => {
  exec.mockResolvedValue({ stdout: JSON.stringify({ cards: [card, { ...card, id: 'deleted' }] }) });
  readCardStrands.mockResolvedValue([card]);
  expect(
    (await new StrandData('/repo/.millstrand', database).board()).cards.map(({ id }) => id),
  ).toEqual(['card1']);
});

it('reports hydration failures rather than claiming cards have no configuration', async () => {
  exec.mockResolvedValue({ stdout: JSON.stringify({ cards: [card] }) });
  readCardStrands.mockRejectedValue(
    Object.assign(new Error('Matching-row cap exceeded'), { status: 502 }),
  );
  await expect(new StrandData('/repo/.millstrand', database).board()).rejects.toMatchObject({
    status: 502,
  });
});
