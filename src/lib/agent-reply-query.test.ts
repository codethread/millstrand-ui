import { QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { AgentReply } from '../../shared/api';
import { agentReplyQueryOptions } from './api/agents';
import { createQueryClient } from './api/query-client';

afterEach(() => vi.unstubAllGlobals());

it('pauses an unmounted reply, retains errors/data, and reads late terminal results on reopening', async () => {
  const reply: AgentReply = {
    id: 'run',
    title: 'Completed run',
    alias: null,
    identity: null,
    target: null,
    mode: 'headless',
    ownership: null,
    status: 'stopped',
    substatus: 'completed',
    result: null,
    error: null,
    prompt: null,
  };
  const fetch = vi.fn(async () => Response.json(reply));
  vi.stubGlobal('fetch', fetch);
  const client = createQueryClient();
  const options = { ...agentReplyQueryOptions('workspace', 'run', true), retry: false };
  const owner = new QueryObserver(client, options);
  const stop = owner.subscribe(() => {});
  await owner.refetch();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/agent-runs/run?workspace=workspace',
    undefined,
  );
  expect(owner.options.refetchInterval).toBe(5000);
  const snapshot = owner.getCurrentResult().data;
  fetch.mockRejectedValue(new Error('Reply unavailable'));
  await owner.refetch();
  expect(owner.getCurrentResult().data).toBe(snapshot);
  expect(owner.getCurrentResult().error?.message).toBe('Reply unavailable');

  stop();
  await client.invalidateQueries({ queryKey: options.queryKey });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(options.queryKey)).toBe(snapshot);

  fetch.mockImplementation(async () => Response.json({ ...reply, result: 'Late final reply' }));
  const reopened = new QueryObserver(client, options);
  const close = reopened.subscribe(() => {});
  await reopened.refetch({ cancelRefetch: false });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(reopened.getCurrentResult().data?.result).toBe('Late final reply');
  expect(reopened.options.refetchInterval).toBe(5000);
  close();
  client.clear();
});
