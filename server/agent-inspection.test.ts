import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand.ts';

const { exec, send } = vi.hoisted(() => ({
  exec: vi.fn(),
  send: vi.fn(),
}));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

function result(value: unknown) {
  return Object.assign(Promise.resolve({ stdout: JSON.stringify(JSON.stringify(value)) }), {
    child: { stdin: { end: send } },
  });
}

beforeEach(() => {
  exec.mockReset();
  send.mockReset();
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

it('inspects a large workspace without a whole-strand list and retains completed runs and owned work', async () => {
  exec.mockImplementation((file) => {
    if (file !== 'mill') throw new Error('Read result matched 18054 strands, exceeding cap');
    return result([
      identity,
      run,
      { ...identity, id: 'card1', attributes: { owner: 'test-agent', 'kanban/card': 'true' } },
    ]);
  });
  const data = new StrandData('/repo/.millstrand');
  const directory = await data.agents();
  expect(directory.identities).toHaveLength(1);
  expect(directory.identities[0]).toMatchObject({
    id: 'test-agent',
    runs: [{ id: 'run1', status: 'stopped', substatus: 'completed' }],
    work: [{ id: 'card1', kind: 'card' }],
  });
  expect(JSON.stringify(directory)).not.toContain('private');
  expect(await data.agents()).toBe(directory);
  expect(exec).toHaveBeenCalledTimes(1);
  expect(exec.mock.calls[0]?.slice(0, 2)).toEqual([
    'mill',
    ['weaver', 'repl', '--workspace', '/repo/.millstrand', '--stdin'],
  ]);
});

it('sends a fixed bounded selective program, not interpolated workspace input', async () => {
  exec.mockImplementation(() => result([]));
  const workspace = '/repo/"(throw (Exception.))/.millstrand';
  expect((await new StrandData(workspace).agents()).identities).toEqual([]);
  const source: unknown = send.mock.calls[0]?.[0];
  expect(source).toEqual(expect.stringContaining('millstrand.api.weaver.alpha/list-lean'));
  expect(source).toEqual(expect.stringContaining('[:attr "identity/session"]'));
  expect(source).toEqual(expect.stringContaining('"harness/published"'));
  expect(source).toEqual(expect.stringContaining('[:exists [:attr "owner"]]'));
  expect(source).toEqual(expect.stringContaining('{} 10000'));
  expect(source).not.toEqual(expect.stringContaining(workspace));
  expect(source).not.toEqual(expect.stringContaining('[:state'));
});

it('reports query/transport failures without caching an empty directory and can refresh again', async () => {
  exec.mockImplementationOnce(() =>
    Object.assign(Promise.reject(new Error('Read result exceeded matching-row cap')), {
      child: { stdin: { end: send } },
    }),
  );
  const data = new StrandData('/repo/.millstrand');
  await expect(data.agents()).rejects.toMatchObject({ status: 502 });
  exec.mockImplementation(() => result([identity]));
  expect((await data.agents()).identities).toHaveLength(1);
});

it('rejects malformed envelopes and malformed domain data rather than claiming no agents', async () => {
  exec.mockImplementationOnce(() =>
    Object.assign(Promise.resolve({ stdout: 'nil' }), { child: { stdin: { end: send } } }),
  );
  await expect(new StrandData('/repo/.millstrand').agents()).rejects.toMatchObject({ status: 502 });
  exec.mockImplementationOnce(() =>
    result([{ ...identity, attributes: { 'identity/session': 'true' } }]),
  );
  await expect(new StrandData('/repo/.millstrand').agents()).rejects.toThrow('identity/id');
});
