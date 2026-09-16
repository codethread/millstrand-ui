import { afterEach, expect, it, vi } from 'vitest';
import { request } from './transport';

afterEach(() => vi.unstubAllGlobals());

it('keeps requests same-origin and scopes only explicit workspaces', async () => {
  const fetch = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  await expect(request('/board', 'weaver /&?')).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenLastCalledWith('/api/board?workspace=weaver%20%2F%26%3F', undefined);
  await request('/board', null);
  expect(fetch).toHaveBeenLastCalledWith('/api/board', undefined);
});

it.each([
  [{ error: 'Weaver unavailable' }, 'Weaver unavailable'],
  [{ detail: 'other payload' }, 'Request failed (503)'],
])('preserves HTTP error feedback from %j', async (body, message) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body, { status: 503 })),
  );
  await expect(request('/board', 'a')).rejects.toThrow(message);
});
