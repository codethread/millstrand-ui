/** Shared latency vocabulary for client and server request logging. */
export const perfWarnMs = 5;
export const perfSlowMs = 50;

export type PerfLevel = 'fine' | 'warn' | 'slow';
export type PerfScope = 'server' | 'client' | 'strand' | 'mill' | 'sqlite' | 'session-log';

export interface PerfSample {
  at: string;
  scope: PerfScope;
  target: string;
  ms: number;
  workspace?: string;
  detail?: string;
  /** Deliberately long work (weaver lifecycle), not a slow local read. */
  expected?: boolean;
}

/** A warm local read should be far below the warning tier, so anything above it is worth a look. */
export function perfLevel(ms: number, expected = false): PerfLevel {
  if (expected) return 'fine';
  if (ms > perfSlowMs) return 'slow';
  if (ms > perfWarnMs) return 'warn';
  return 'fine';
}

export function formatPerfSample(sample: PerfSample): string {
  const level = perfLevel(sample.ms, sample.expected === true);
  const marker = level === 'slow' ? ' SLOW' : level === 'warn' ? ' WARN' : '';
  const workspace = sample.workspace === undefined ? '' : ` workspace=${sample.workspace}`;
  const detail = sample.detail === undefined ? '' : ` ${sample.detail}`;
  return `${sample.at} perf${marker} ${sample.ms.toFixed(2)}ms ${sample.scope} ${sample.target}${workspace}${detail}`;
}
