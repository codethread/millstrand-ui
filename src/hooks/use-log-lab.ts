import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  conceptSchema,
  logDirectorySchema,
  logSnapshotSchema,
  type LogProvider,
} from '../../shared/log-lab';

async function request(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Log source request failed (${response.status})`);
  return response.json() as Promise<unknown>;
}
// This isolated lab owns directory freshness and the selected session's SSE subscription.
export function useLogDirectory() {
  return useQuery({
    queryKey: ['log-lab', 'sessions'],
    queryFn: async () => logDirectorySchema.parse(await request('/api/log-lab/sessions')),
    refetchInterval: 15000,
  });
}
export function useLogConcept() {
  return useQuery({
    queryKey: ['log-lab', 'concept'],
    queryFn: async () =>
      z.object({ concept: conceptSchema }).parse(await request('/api/log-lab/config')).concept,
    staleTime: Infinity,
  });
}
type Connection =
  { kind: 'connecting' } | { kind: 'connected' } | { kind: 'error'; message: string };
export function useLogStream(provider: LogProvider, session: string, paused: boolean) {
  const client = useQueryClient();
  const [connection, setConnection] = useState<Connection>({ kind: 'connecting' });
  const key = ['log-lab', 'snapshot', provider, session];
  const snapshot = useQuery({
    queryKey: key,
    queryFn: async () =>
      logSnapshotSchema.parse(
        await request(
          `/api/log-lab/snapshot?provider=${provider}&session=${encodeURIComponent(session)}`,
        ),
      ),
    enabled: false,
    refetchInterval: false,
  });
  useEffect(() => {
    if (paused) return undefined;
    const stream = new EventSource(
      `/api/log-lab/stream?provider=${provider}&session=${encodeURIComponent(session)}`,
    );
    stream.addEventListener('snapshot', (event: MessageEvent<string>) => {
      try {
        const data = logSnapshotSchema.parse(JSON.parse(event.data) as unknown);
        client.setQueryData(['log-lab', 'snapshot', provider, session], data);
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
