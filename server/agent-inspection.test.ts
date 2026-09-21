import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand.ts';

const readProvenance = vi.fn();
const database = { readProvenance, readDependencies: vi.fn() };

beforeEach(() => readProvenance.mockReset());

const identity = {
  id: 'identity1',
  title: 'Identity',
  state: 'active',
  created_at: '2026-09-15 08:00:00',
  updated_at: '2026-09-15 08:00:00',
  attributes: {
    'identity/session': 'true',
    'identity/id': 'test-agent',
    'identity/harness': 'pi',
  },
};
const run = {
  ...identity,
  id: 'run1',
  state: 'closed',
  attributes: {
    'harness/run': 'true',
    'harness/published': 'true',
    'identity/id': 'test-agent',
    'harness/alias': 'tui',
    'harness/harness': 'pi',
    'harness/mode': 'headless',
    'harness/status': 'stopped',
    'harness/substatus': 'completed',
  },
};
const card = {
  ...identity,
  id: 'card1',
  attributes: { 'kanban/card': 'true' },
};
const claim = {
  ...identity,
  id: 'claim1',
  state: 'closed',
  attributes: {
    'kanban/ownership-claim': 'true',
    'kanban/owner': 'test-agent',
    'kanban/claimed-at': '2026-09-15T08:00:00Z',
  },
};

it('retains completed runs and current work from durable role edges', async () => {
  readProvenance.mockResolvedValue({
    strands: [identity, run, card, claim],
    edges: [
      { from_strand_id: 'identity1', to_strand_id: 'run1', edge_type: 'performed' },
      { from_strand_id: 'claim1', to_strand_id: 'card1', edge_type: 'claims' },
      { from_strand_id: 'identity1', to_strand_id: 'claim1', edge_type: 'claimed' },
    ],
  });
  const data = new StrandData('/repo/.millstrand', database);
  const directory = await data.agents();
  expect(directory.identities[0]).toMatchObject({
    id: 'test-agent',
    runs: [{ id: 'run1', status: 'stopped', substatus: 'completed' }],
    work: [{ id: 'card1', kind: 'card' }],
  });
  expect(directory.runs).toHaveLength(1);
  expect(await data.agents()).toBe(directory);
  expect(readProvenance).toHaveBeenCalledTimes(1);
});

it('reports persisted read failures without caching an empty directory and can refresh again', async () => {
  readProvenance.mockRejectedValueOnce(
    Object.assign(new Error('Read result exceeded matching-row cap'), { status: 502 }),
  );
  const data = new StrandData('/repo/.millstrand', database);
  await expect(data.agents()).rejects.toMatchObject({ status: 502 });
  readProvenance.mockResolvedValue({ strands: [identity], edges: [] });
  expect((await data.agents()).identities).toHaveLength(1);
});

it('rejects malformed persisted domain data rather than claiming no agents', async () => {
  readProvenance.mockResolvedValue({
    strands: [{ ...identity, attributes: { 'identity/session': 'true' } }],
    edges: [],
  });
  await expect(new StrandData('/repo/.millstrand', database).agents()).rejects.toThrow(
    'identity/id',
  );
});
