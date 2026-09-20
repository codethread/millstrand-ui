import { useRelevantAgentActivity, useAgentStatus } from '../hooks/use-agents';
import { useDashboardActions } from '../lib/navigation';
import { cn } from '../lib/utils';
import { Avatar } from './issue-parts';
import { useWorkspace } from '../hooks/use-workspace';
import { AgentLogHint } from './agent-log-hint';

/** Shared issue/task badge. Ownership is not proof of execution on the item:
 * only an explicit direct/root run target earns “Working”. */
export function IssueAgents({ owner, target }: { owner: string | null; target: string }) {
  const activity = useRelevantAgentActivity(owner, target);
  const health = useAgentStatus();
  const workspace = useWorkspace();
  const { openAgent } = useDashboardActions();
  const agents = activity.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {agents.map(({ identity, run, label, relation }) => (
        <button
          key={identity.strandId}
          className="agent-link"
          onClick={() => openAgent(identity.id)}
          aria-label={`View agent ${identity.id}`}
          title={`${identity.id} · ${run?.alias ?? identity.harness}. ${health.error ? 'Activity refresh failed; last known status. ' : ''}${relation === 'owner-session' ? 'Owner’s session is running; work on this issue is not confirmed.' : label}`}
        >
          <span
            className={cn(
              'agent-status',
              !health.error && `agent-status-${run?.status ?? 'unknown'}`,
            )}
          >
            <span className="agent-dot" />
            <strong className="truncate">{run?.alias ?? identity.harness}</strong>
            <span className="ml-auto whitespace-nowrap text-[9px]">
              {health.error ? 'Last seen: ' : ''}
              {label}
            </span>
          </span>
          <span className="truncate text-[10px] text-muted-foreground">{identity.id}</span>
          {run?.status === 'running' && (
            <AgentLogHint
              workspace={workspace}
              identityStrandId={identity.strandId}
              stale={health.error !== null}
            />
          )}
        </button>
      ))}
      {!agents.some(({ identity }) => identity.id === owner) && owner && (
        <span
          className="flex items-center gap-2"
          title={health.error ? 'Agent activity unavailable' : owner}
        >
          <span className="owner-name">{owner}</span>
          <Avatar owner={owner} />
        </span>
      )}
      {!owner && agents.length === 0 && <span className="text-muted-foreground">Unassigned</span>}
    </div>
  );
}
