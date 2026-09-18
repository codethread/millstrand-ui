import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand.ts';

const readAgentStrands = vi.fn();
const database = {
  readAgentStrands,
  readCardStrands: vi.fn(),
};

beforeEach(() => {
  readAgentStrands.mockReset();
  database.readCardStrands.mockReset();
});

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
    'harness/env': { TOKEN: 'private' },
  },
};

it('retains completed runs and owned work without exposing unselected attributes', async () => {
  readAgentStrands.mockResolvedValue([
    identity,
    run,
    { ...identity, id: 'card1', attributes: { owner: 'test-agent', 'kanban/card': 'true' } },
  ]);
  const data = new StrandData('/repo/.millstrand', database);
  const directory = await data.agents();
  expect(directory.identities).toHaveLength(1);
  expect(directory.identities[0]).toMatchObject({
    id: 'test-agent',
    runs: [{ id: 'run1', status: 'stopped', substatus: 'completed' }],
    work: [{ id: 'card1', kind: 'card' }],
  });
  expect(JSON.stringify(directory)).not.toContain('private');
  expect(await data.agents()).toBe(directory);
  expect(readAgentStrands).toHaveBeenCalledTimes(1);
});

it('reports persisted read failures without caching an empty directory and can refresh again', async () => {
  readAgentStrands.mockRejectedValueOnce(
    Object.assign(new Error('Read result exceeded matching-row cap'), { status: 502 }),
  );
  const data = new StrandData('/repo/.millstrand', database);
  await expect(data.agents()).rejects.toMatchObject({ status: 502 });
  readAgentStrands.mockResolvedValue([identity]);
  expect((await data.agents()).identities).toHaveLength(1);
});

it('rejects malformed persisted domain data rather than claiming no agents', async () => {
  readAgentStrands.mockResolvedValue([{ ...identity, attributes: { 'identity/session': 'true' } }]);
  await expect(new StrandData('/repo/.millstrand', database).agents()).rejects.toThrow(
    'identity/id',
  );
});
