import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { formatPerfSample, perfLevel, type PerfSample } from '../shared/perf.ts';

const maxLogBytes = 5 * 1024 * 1024;

export const defaultPerfLogPath = join(homedir(), '.local/state/millstrand-ui/perf.log');

export type PerfSink = (sample: PerfSample) => void;

let sink: PerfSink | null = null;

/**
 * Library code (strand calls, persisted reads, session logs) records through this
 * sink. Nothing is captured until the server or a profile run installs one, so
 * tests and one-off imports stay quiet.
 */
export function setPerfSink(next: PerfSink | null): void {
  sink = next;
}

export function recordPerf(sample: Omit<PerfSample, 'at'>): void {
  sink?.({ at: new Date().toISOString(), ...sample });
}

function rotate(path: string, maxBytes: number): void {
  try {
    if (statSync(path).size < maxBytes) return;
  } catch {
    return;
  }
  rmSync(`${path}.1`, { force: true });
  renameSync(path, `${path}.1`);
}

/**
 * Append-only request log. Every sample lands in the file; only the warning tiers
 * reach the console so normal output keeps the server's startup and error lines.
 * Discarding is preferable to failing a request when the log itself is unwritable.
 */
export class PerfLog {
  constructor(
    readonly path: string = defaultPerfLogPath,
    maxBytes: number = maxLogBytes,
  ) {
    mkdirSync(dirname(path), { recursive: true });
    rotate(path, maxBytes);
  }

  record = (sample: PerfSample): void => {
    const line = formatPerfSample(sample);
    try {
      appendFileSync(this.path, `${line}\n`);
    } catch (error) {
      console.error(`perf log write failed: ${String(error)}`);
    }
    const level = perfLevel(sample.ms, sample.expected === true);
    if (level === 'slow') console.error(line);
    else if (level === 'warn') console.warn(line);
  };
}
