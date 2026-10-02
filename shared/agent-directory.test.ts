import { expect, it } from 'vitest';
import type { AgentDirectory, AgentRun } from './api.ts';
import { decodeAgentDirectory, encodeAgentDirectory } from './agent-directory.ts';

const run: AgentRun = {
  id: 'run-1',
  requestId: null,
  title: 'Inspect the card',
  alias: 'steady-otter',
  harness: 'pi',
  status: 'running',
  substatus: null,
  mode: 'headless',
  model: 'test-model',
  effort: 'high',
  cwd: '/workspace',
  ownership: null,
  target: 'card-1',
  rootTargets: ['card-1'],
  participants: [{ identity: 'worker', status: 'resolved', identityStrandIds: ['identity-1'] }],
  session: { provider: 'pi', session: 'session-1' },
  continuation: null,
  createdAt: '2026-10-02 08:00:00',
  startedAt: '2026-10-02T08:00:01Z',
  finishedAt: null,
};

const directory: AgentDirectory = {
  workspace: { path: '/workspace/.millstrand', name: 'workspace' },
  fetchedAt: '2026-10-02T08:00:02Z',
  identities: [
    {
      id: 'worker',
      strandId: 'identity-1',
      harness: 'pi',
      model: 'test-model',
      effort: 'high',
      parentIdentityStrandIds: [],
      createdAt: '2026-10-02 07:59:00',
      runs: [run],
      work: [{ id: 'card-1', title: 'Card', state: 'active', kind: 'card' }],
    },
  ],
  runs: [run],
};

it('sends each run once and restores identity run references', () => {
  const payload = encodeAgentDirectory(directory);

  expect(payload.identities).toEqual([
    expect.objectContaining({ strandId: 'identity-1', runIds: ['run-1'] }),
  ]);
  expect(payload.identities[0]).not.toHaveProperty('runs');
  expect(decodeAgentDirectory(payload)).toEqual(directory);
});

it('rejects a missing identity run instead of hiding incomplete directory data', () => {
  const payload = encodeAgentDirectory(directory);
  payload.identities[0]!.runIds = ['missing'];

  expect(() => decodeAgentDirectory(payload)).toThrow(
    'Agent identity identity-1 references missing run missing',
  );
});
