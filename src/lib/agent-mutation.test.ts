import { afterEach, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { agentPromptMutationOptions } from './api';

const track = vi.hoisted(() => vi.fn());
vi.mock('../agent-prompt-store', () => ({ useAgentPromptStore: { getState: () => ({ track }) } }));
afterEach(() => {
  vi.unstubAllGlobals();
  track.mockReset();
});

it('records the original weaver receipt even if the composer unmounts before the response', async () => {
  let finish = (_response: Response) => {};
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
