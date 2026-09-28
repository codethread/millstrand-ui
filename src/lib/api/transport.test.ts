import { afterEach, expect, it, vi } from 'vitest';
import { MemoryPerfLogger } from '../../../shared/perf';
import { createRequest } from './transport';

const request = createRequest();

afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps requests same-origin and scopes only explicit workspaces', async () => {
  const fetch = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  await expect(request('/board', 'weaver /&?')).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenLastCalledWith('/api/board?workspace=weaver%20%2F%26%3F', undefined);
  await request('/board', null);
  expect(fetch).toHaveBeenLastCalledWith('/api/board', undefined);
});

it('captures request measurements in memory without affecting another transport', async () => {
  const logger = new MemoryPerfLogger();
  const measuredRequest = createRequest(logger);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ok: true })),
  );
  await measuredRequest('/board', 'a');
  await request('/agents', 'a');
  expect(logger.samples).toEqual([
    {
      scope: 'client',
      target: 'GET /api/board',
      ms: expect.any(Number),
      detail: 'status=200 bytes=?',
    },
  ]);
});

it.each([
  [{ error: 'Weaver unavailable' }, 'Weaver unavailable'],
  [{ detail: 'other payload' }, 'Request failed (503)'],
])('preserves HTTP error feedback from %j', async (body, message) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body, { status: 503 })),
  );
  const logger = new MemoryPerfLogger();
  await expect(createRequest(logger)('/board', 'a')).rejects.toThrow(message);
  expect(logger.samples).toEqual([
    { scope: 'client', target: 'GET /api/board', ms: expect.any(Number), detail: 'status=503' },
  ]);
});
