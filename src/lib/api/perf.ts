import { formatPerfSample, perfLevel, type PerfLogger } from '../../../shared/perf';

/** Browser output adapter for the same latency budget as the server. */
export const consolePerfLogger: PerfLogger = {
  record(sample) {
    const line = formatPerfSample({ at: new Date().toISOString(), ...sample });
    const level = perfLevel(sample.ms, sample.expected === true);
    if (level === 'slow') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.debug(line);
  },
};
