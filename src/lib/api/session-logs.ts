import { queryOptions } from '@tanstack/react-query';
import type { LogSource } from '../../../shared/log-activity';
import { logSnapshotSchema } from '../../../shared/session-log';
import { request } from './transport';

function sessionLogPath(source: LogSource, action: 'snapshot' | 'stream'): string {
  const query = new URLSearchParams({ provider: source.provider, session: source.session });
  return `/session-logs/${action}?${query}`;
}

export function sessionLogStreamUrl(source: LogSource): string {
  return `/api${sessionLogPath(source, 'stream')}`;
}

export function sessionLogOptions(source: LogSource) {
  return queryOptions({
    queryKey: ['session-log', source.provider, source.session],
    queryFn: async () =>
      logSnapshotSchema.parse(await request<unknown>(sessionLogPath(source, 'snapshot'), null)),
    enabled: false,
    refetchInterval: false,
  });
}
