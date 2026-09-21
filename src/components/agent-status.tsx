import type { AgentRun } from '../../shared/api';
import { launchRefusalNote, runLabel } from '../lib/agents';
import { cn } from '../lib/utils';

export function AgentRunStatus({ run, stale = false }: { run: AgentRun | null; stale?: boolean }) {
  const label = runLabel(run);
  // A graph-blocked queued run is not ordinary executable queueing, so it gets the
  // quiet warning colour instead of the queued one.
  const state = label === 'Blocked' ? 'blocked' : (run?.status ?? 'unknown');
  const refusalNote = label === 'Blocked' ? launchRefusalNote(run?.launchRefusal ?? null) : null;
  return (
    <span
      className={cn('agent-status', !stale && `agent-status-${state}`)}
      title={refusalNote ?? undefined}
    >
      <span className="agent-dot" />
      {stale ? 'Last seen: ' : ''}
      {label}
    </span>
  );
}
