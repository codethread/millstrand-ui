import { useAttentionStore } from '../attention-store';
import { useEffect, useMemo, useState } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { LogActivity, LogBinding } from '../../shared/log-activity';
import { useCockpitStore } from '../cockpit-store';
import { logActivityOptions } from '../lib/api/log-activity';
import { cockpitWork, type CockpitLogRead } from '../lib/overview';
import { useOverview } from './use-overview';

const selectBindings = (data: LogActivity) => data.bindings;
const combineLogs = (results: UseQueryResult<LogBinding[]>[]): CockpitLogRead[] =>
  results.map((result) => ({ bindings: result.data ?? null, failed: result.error !== null }));

export function useCockpit() {
  // Existing owners remain authoritative: useOverview for cards/agents,
  // OverviewLogPolls for logs, WorkspaceDiscovery for discovery.
  const overview = useOverview();
  const { pinned, busy, other } = overview.activity;
  const snapshots = useMemo(() => [...pinned, ...busy, ...other], [pinned, busy, other]);
  const logs = useQueries({
    queries: snapshots.map(({ workspace }) => ({
      ...logActivityOptions(workspace.id),
      enabled: false,
      refetchInterval: false as const,
      select: selectBindings,
    })),
    combine: combineLogs,
  });
  const attentionLabels = useAttentionStore((state) => state.labels);
  const search = useCockpitStore((state) => state.search);
  const scope = useCockpitStore((state) => state.scope);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const work = useMemo(
    () => cockpitWork(snapshots, logs, { search, scope, attentionLabels }, now),
    [snapshots, logs, search, scope, attentionLabels, now],
  );
  return { ...overview, snapshots, work };
}
