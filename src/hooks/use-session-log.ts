import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logSnapshotSchema, type LogProvider } from '../../shared/session-log';
import { sessionLogOptions, sessionLogStreamUrl } from '../lib/api/session-logs';

type Connection =
  { kind: 'connecting' } | { kind: 'connected' } | { kind: 'error'; message: string };

/** The visible compact log or expanded overlay owns this SSE subscription. */
export function useLogStream(provider: LogProvider, session: string, paused: boolean) {
  const client = useQueryClient();
  const [connection, setConnection] = useState<Connection>({ kind: 'connecting' });
  const snapshot = useQuery(sessionLogOptions({ provider, session }));
  useEffect(() => {
    if (paused) return undefined;
    const source = { provider, session };
    const stream = new EventSource(sessionLogStreamUrl(source));
    stream.addEventListener('snapshot', (event: MessageEvent<string>) => {
      try {
        const data = logSnapshotSchema.parse(JSON.parse(event.data) as unknown);
        client.setQueryData(sessionLogOptions(source).queryKey, data);
        setConnection({ kind: 'connected' });
      } catch {
        setConnection({
          kind: 'error',
          message: 'Unsupported stream data. Last snapshot retained.',
        });
      }
    });
    stream.addEventListener('source-error', () =>
      setConnection({
        kind: 'error',
        message: 'Log file unavailable. Last snapshot retained; checking again every second.',
      }),
    );
    stream.addEventListener('error', () =>
      setConnection({
        kind: 'error',
        message: 'Disconnected. Last snapshot retained; automatically reconnecting.',
      }),
    );
    return () => stream.close();
  }, [client, provider, session, paused]);
  return { snapshot: snapshot.data, connection: paused ? { kind: 'paused' as const } : connection };
}
