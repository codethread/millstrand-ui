import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { formatPerfSample, perfLevel } from '../shared/perf';
import { PerfLog } from './perf';

const at = '2026-09-28T00:00:00.000Z';
const directories: string[] = [];

function logPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'millstrand-perf-'));
  directories.push(directory);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(at));
  return join(directory, 'perf.log');
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it.each([
  [0, 'fine'],
  [5, 'fine'],
  [5.01, 'warn'],
  [50, 'warn'],
  [50.01, 'slow'],
])('classifies %dms as %s', (ms, level) => {
  expect(perfLevel(ms)).toBe(level);
});

it('treats expected long work as fine regardless of duration', () => {
  expect(perfLevel(120_000, true)).toBe('fine');
});

it('formats scope, workspace and detail for the log and console', () => {
  expect(
    formatPerfSample({
      at: '2026-09-27T20:00:00.000Z',
      scope: 'sqlite',
      target: 'provenance',
      workspace: 'agents',
      ms: 83.156,
      detail: 'rows=25727 query=102.83ms',
    }),
  ).toBe(
    '2026-09-27T20:00:00.000Z perf SLOW 83.16ms sqlite provenance workspace=agents rows=25727 query=102.83ms',
  );
  expect(formatPerfSample({ at: 'T', scope: 'server', target: 'GET /api/board', ms: 0.4 })).toBe(
    'T perf 0.40ms server GET /api/board',
  );
});

it('appends every sample to the file and prints only warnings', () => {
  const path = logPath();
  const log = new PerfLog(path);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  log.record({ scope: 'server', target: 'GET /api/board', ms: 0.4 });
  log.record({ scope: 'strand', target: 'strand notes', ms: 12 });
  log.record({ scope: 'sqlite', target: 'provenance', ms: 80 });
  expect(warn.mock.calls).toEqual([[`${at} perf WARN 12.00ms strand strand notes`]]);
  expect(error.mock.calls).toEqual([[`${at} perf SLOW 80.00ms sqlite provenance`]]);
  expect(readFileSync(path, 'utf8').trim().split('\n')).toEqual([
    `${at} perf 0.40ms server GET /api/board`,
    `${at} perf WARN 12.00ms strand strand notes`,
    `${at} perf SLOW 80.00ms sqlite provenance`,
  ]);
});

it('rotates an oversized log before appending', () => {
  const path = logPath();
  writeFileSync(path, 'x'.repeat(64));
  const log = new PerfLog(path, 32);
  log.record({ scope: 'server', target: 'GET /api/board', ms: 1 });
  expect(readFileSync(`${path}.1`, 'utf8')).toBe('x'.repeat(64));
  expect(readFileSync(path, 'utf8')).toBe(`${at} perf 1.00ms server GET /api/board\n`);
});
