import { formatPerfSample, perfLevel, type PerfSample } from '../../../shared/perf';

/**
 * Browser-side view of the same latency budget. The server logs every request it
 * receives; this records the client's own fetch time (including body parsing) at
 * matching thresholds so slow calls are visible where the request starts.
 */
export function recordClientPerf(sample: Omit<PerfSample, 'at' | 'scope'>): void {
  const line = formatPerfSample({ at: new Date().toISOString(), scope: 'client', ...sample });
  const level = perfLevel(sample.ms);
  if (level === 'slow') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.debug(line);
}
