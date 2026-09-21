import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand';

const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

const readProvenance = vi.fn();
const database = { readProvenance, readDependencies: vi.fn() };

beforeEach(() => {
  exec.mockReset();
  readProvenance.mockReset();
  database.readDependencies.mockReset();
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
  readProvenance.mockResolvedValue({
    strands: [
      {
        ...card,
        attributes: { 'kanban/card': 'true', 'auto-run/error': error },
      },
    ],
    edges: [],
  });
  const data = new StrandData('/repo/.millstrand', database);
  const board = await data.board();
  expect(board.cards[0]?.autoRun?.error).toBe(error);
  expect(exec).toHaveBeenCalledTimes(1);
  expect(exec.mock.calls[0]?.slice(0, 2)).toEqual([
    'strand',
    ['--workspace', '/repo/.millstrand', 'kanban', 'board', '--all', 'true'],
  ]);
  expect(readProvenance).toHaveBeenCalledTimes(1);
  expect(await data.board()).toBe(board);
});

it('omits a deleted card without rejecting its surviving peers', async () => {
  exec.mockResolvedValue({ stdout: JSON.stringify({ cards: [card, { ...card, id: 'deleted' }] }) });
  readProvenance.mockResolvedValue({
    strands: [{ ...card, attributes: { 'kanban/card': 'true' } }],
    edges: [],
  });
  expect(
    (await new StrandData('/repo/.millstrand', database).board()).cards.map(({ id }) => id),
  ).toEqual(['card1']);
});

it('reports hydration failures rather than claiming cards have no configuration', async () => {
  exec.mockResolvedValue({ stdout: JSON.stringify({ cards: [card] }) });
  readProvenance.mockRejectedValue(
    Object.assign(new Error('Matching-row cap exceeded'), { status: 502 }),
  );
  await expect(new StrandData('/repo/.millstrand', database).board()).rejects.toMatchObject({
    status: 502,
  });
});

it('coalesces concurrent dependency reads and reuses the short-lived successful snapshot', async () => {
  const graph = { rootId: '', nodes: [], edges: [] };
  database.readDependencies.mockResolvedValue(graph);
  const data = new StrandData('/repo/.millstrand', database);
  const [first, second] = await Promise.all([data.dependencies(), data.dependencies()]);
  expect(first).toBe(graph);
  expect(second).toBe(graph);
  expect(await data.dependencies()).toBe(graph);
  expect(database.readDependencies).toHaveBeenCalledTimes(1);
});

it('does not cache dependency failures as empty success', async () => {
  database.readDependencies.mockRejectedValueOnce(new Error('Unsupported storage'));
  const data = new StrandData('/repo/.millstrand', database);
  await expect(data.dependencies()).rejects.toThrow('Unsupported storage');
  const graph = { rootId: '', nodes: [], edges: [] };
  database.readDependencies.mockResolvedValue(graph);
  expect(await data.dependencies()).toBe(graph);
  expect(database.readDependencies).toHaveBeenCalledTimes(2);
});
