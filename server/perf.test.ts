import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { formatPerfSample, perfLevel, type PerfSample } from '../shared/perf';
import { PerfLog, recordPerf, setPerfSink } from './perf';

afterEach(() => {
  setPerfSink(null);
  vi.restoreAllMocks();
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

it('records through the installed sink only', () => {
  const samples: PerfSample[] = [];
  recordPerf({ scope: 'strand', target: 'strand kanban board', ms: 69, workspace: 'agents' });
  expect(samples).toEqual([]);
  setPerfSink((sample) => samples.push(sample));
  recordPerf({ scope: 'strand', target: 'strand kanban board', ms: 69, workspace: 'agents' });
  expect(samples).toHaveLength(1);
  expect(samples[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(samples[0]?.target).toBe('strand kanban board');
});

it('appends every sample to the file and prints only warnings', () => {
  const directory = mkdtempSync(join(tmpdir(), 'millstrand-perf-'));
  const log = new PerfLog(join(directory, 'perf.log'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  log.record({ at: 'T1', scope: 'server', target: 'GET /api/board', ms: 0.4 });
  log.record({ at: 'T2', scope: 'strand', target: 'strand notes', ms: 12 });
  log.record({ at: 'T3', scope: 'sqlite', target: 'provenance', ms: 80 });
  expect(warn.mock.calls.map(([line]) => String(line).slice(0, 14))).toEqual(['T2 perf WARN 1']);
  expect(error.mock.calls.map(([line]) => String(line).slice(0, 14))).toEqual(['T3 perf SLOW 8']);
  const lines = readFileSync(join(directory, 'perf.log'), 'utf8').trim().split('\n');
  expect(lines).toHaveLength(3);
  expect(lines[0]).toBe('T1 perf 0.40ms server GET /api/board');
  rmSync(directory, { recursive: true, force: true });
});

it('rotates an oversized log before appending', () => {
  const directory = mkdtempSync(join(tmpdir(), 'millstrand-perf-'));
  const path = join(directory, 'perf.log');
  writeFileSync(path, 'x'.repeat(64));
  const log = new PerfLog(path, 32);
  log.record({ at: 'T', scope: 'server', target: 'GET /api/board', ms: 1 });
  expect(readFileSync(`${path}.1`, 'utf8')).toBe('x'.repeat(64));
  expect(readFileSync(path, 'utf8')).toBe('T perf 1.00ms server GET /api/board\n');
  rmSync(directory, { recursive: true, force: true });
});
