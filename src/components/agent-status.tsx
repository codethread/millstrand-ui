import type { AgentRun } from '../../shared/api';
import { runLabel, runTone } from '../lib/agents';
import { cn } from '../lib/utils';

export function AgentRunStatus({ run, stale = false }: { run: AgentRun | null; stale?: boolean }) {
  return (
    <span className={cn('agent-status', !stale && `agent-status-${runTone(run)}`)}>
      <span className="agent-dot" />
      {stale ? 'Last seen: ' : ''}
      {runLabel(run)}
    </span>
  );
}
