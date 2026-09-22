import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand';

const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

const readProvenance = vi.fn();
const readNoteProvenance = vi.fn();
const database = { readProvenance, readNoteProvenance, readDependencies: vi.fn() };

beforeEach(() => {
  exec.mockReset();
  readProvenance.mockReset();
  readNoteProvenance.mockReset();
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

it('shares one parsed persisted snapshot across board, agents and log consumers', async () => {
  exec.mockResolvedValue({ stdout: JSON.stringify({ cards: [card] }) });
  readProvenance.mockResolvedValue({
    strands: [{ ...card, attributes: { 'kanban/card': 'true' } }],
    edges: [],
  });
  const data = new StrandData('/repo/.millstrand', database);
  const [board, agents, provenance] = await Promise.all([
    data.board(),
    data.agents(),
    data.provenance(),
  ]);
  expect(board.cards.map((item) => item.id)).toEqual(['card1']);
  expect(agents.identities).toEqual([]);
  expect(provenance.logBindings()).toEqual([]);
  expect(await data.provenance()).toBe(provenance);
  expect(readProvenance).toHaveBeenCalledTimes(1);
});

it('does not cache a failed shared projection as an empty successful snapshot', async () => {
  const data = new StrandData('/repo/.millstrand', database);
  readProvenance.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(data.provenance()).rejects.toThrow('Storage unavailable');
  readProvenance.mockResolvedValue({ strands: [], edges: [] });
  expect((await data.provenance()).agents()).toEqual({ identities: [], runs: [] });
  expect(readProvenance).toHaveBeenCalledTimes(2);
});

it('loads full notes only on demand, preserving attribution and sharing repeated reads', async () => {
  const row = { ...card, attributes: { 'kanban/card': 'true' } };
  const note = { id: 'note1', note: 'Full note body', at: '2026-09-21', kind: 'summary' };
  readProvenance.mockResolvedValue({ strands: [row], edges: [] });
  readNoteProvenance.mockResolvedValue({
    strands: [{ ...card, id: 'note1', attributes: { 'identity/by-identity': 'worker' } }],
    edges: [],
  });
  exec.mockImplementation((_file, argv) => {
    const op = Array.isArray(argv) ? argv.slice(2) : [];
    if (op[0] === 'kanban' && op[1] === 'board')
      return Promise.resolve({ stdout: JSON.stringify({ cards: [card] }) });
    if (op[0] === 'kanban' && op[1] === 'card')
      return Promise.resolve({
        stdout: JSON.stringify({
          card: row,
          tasks: [
            {
              id: 'task1',
              title: 'Task',
              state: 'active',
              status: 'ready',
              'latest-note': note,
            },
          ],
          'active-work': [],
          ready: [],
          related: [],
        }),
      });
    if (op[0] === 'notes') return Promise.resolve({ stdout: JSON.stringify([note]) });
    throw new Error(`Unexpected command ${JSON.stringify(op)}`);
  });
  const data = new StrandData('/repo/.millstrand', database);
  expect((await data.detail('card1')).tasks[0]?.latestNote?.actor).toMatchObject({
    identity: 'worker',
    status: 'unresolved',
  });
  expect(exec.mock.calls).toHaveLength(2);
  const [notes, same] = await Promise.all([data.cardNotes('card1'), data.cardNotes('card1')]);
  expect(notes).toBe(same);
  expect(notes[0]).toMatchObject({
    text: 'Full note body',
    actor: { identity: 'worker', status: 'unresolved' },
  });
  expect(exec.mock.calls).toHaveLength(3);
  expect(readNoteProvenance).toHaveBeenCalledTimes(2);
  expect(readNoteProvenance).toHaveBeenCalledWith(['note1']);
  await expect(data.cardNotes('missing')).rejects.toMatchObject({ status: 404 });
  expect(exec.mock.calls).toHaveLength(3);
});
