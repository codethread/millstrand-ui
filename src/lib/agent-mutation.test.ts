import { afterEach, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { agentPromptMutationOptions } from './api/agents';

const track = vi.hoisted(() => vi.fn());

function unresolvedResponse(_response: Response): never {
  throw new Error('Response resolver was not initialized');
}

vi.mock('../agent-prompt-store', () => ({ useAgentPromptStore: { getState: () => ({ track }) } }));
afterEach(() => {
  vi.unstubAllGlobals();
  track.mockReset();
});

it('records the original weaver receipt even if the composer unmounts before the response', async () => {
  let finish: (response: Response) => void = unresolvedResponse;
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => response),
  );
  const client = new QueryClient();
  const observer = new MutationObserver(
    client,
    agentPromptMutationOptions(client, 'weaver-a', 'card1'),
  );
  const unsubscribe = observer.subscribe(() => {});
  const input = {
    targetId: 'card1',
    alias: 'tui',
    prompt: 'Help',
    requestId: 'ui-0123456789abcdef',
  };
  const pending = observer.mutate(input);
  unsubscribe();
  finish(Response.json({ id: 'run1', identity: 'tiger', status: 'ready' }));
  await pending;
  expect(track).toHaveBeenCalledExactlyOnceWith('weaver-a', 'run1', input.requestId);
  expect(client.getQueryData(['agent-reply', 'weaver-a', 'run1'])).toMatchObject({ id: 'run1' });
  client.clear();
});

it('dispatches review prompts through the existing card route with unchanged free-form text', async () => {
  const fetch = vi.fn(async () =>
    Response.json({ id: 'run-review', identity: 'tiger', status: 'ready' }),
  );
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient();
  const observer = new MutationObserver(
    client,
    agentPromptMutationOptions(client, 'weaver-a', 'review1'),
  );
  const input = {
    targetId: 'review1',
    targetKind: 'review' as const,
    alias: 'tui',
    prompt: 'dig into this further\nCheck the hypothesis.',
    requestId: 'ui-0123456789abcdef',
  };
  await observer.mutate(input);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/cards/review1/agent-runs'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
  expect(track).toHaveBeenCalledExactlyOnceWith('weaver-a', 'run-review', input.requestId);
  client.clear();
});
