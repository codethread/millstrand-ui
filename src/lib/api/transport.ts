import { nullPerfLogger, type PerfLogger } from '../../../shared/perf';
import { consolePerfLogger } from './perf';

/** Isolated transports are silent unless given an output adapter or memory recorder. */
export function createRequest(logger: PerfLogger = nullPerfLogger) {
  return async function request<T>(
    path: string,
    workspace: string | null,
    init?: RequestInit,
  ): Promise<T> {
    const query = workspace
      ? `${path.includes('?') ? '&' : '?'}workspace=${encodeURIComponent(workspace)}`
      : '';
    const method = init?.method ?? 'GET';
    const started = performance.now();
    const response = await fetch(`/api${path}${query}`, init);
    const record = (detail: string): void =>
      logger.record({
        scope: 'client',
        target: `${method} /api${path}`,
        ms: performance.now() - started,
        detail,
      });
    if (!response.ok) {
      const body: unknown = await response.json();
      record(`status=${response.status}`);
      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string'
          ? body.error
          : `Request failed (${response.status})`;
      throw new Error(message);
    }
    // Fetch exposes JSON as `any`; endpoint contracts provide the type at this boundary.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const body = (await response.json()) as T;
    record(`status=${response.status} bytes=${response.headers.get('content-length') ?? '?'}`);
    return body;
  };
}

/** Production browser transport; tests can construct their own without console mocks. */
export const request = createRequest(consolePerfLogger);
