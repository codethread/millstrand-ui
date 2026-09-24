import { useRelevantAgentActivity, useAgentStatus } from '../hooks/use-agents';
import { useDashboardActions } from '../lib/navigation';
import { runDisplayName } from '../lib/agents';
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
  const { openAgent, openAgentRun } = useDashboardActions();
  const agents = activity.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {agents.map((item) => {
        const name =
          item.kind === 'run'
            ? runDisplayName(item.run)
            : item.run === null
              ? item.identity.harness
              : runDisplayName(item.run);
        const actor = item.kind === 'identity' ? item.identity.id : 'Identity registration pending';
        return (
          <button
            key={item.kind === 'identity' ? item.identity.strandId : `run:${item.run.id}`}
            className="agent-link"
            onClick={() =>
              item.kind === 'run'
                ? openAgentRun(null, item.run.id)
                : openAgent(item.identity.strandId)
            }
            aria-label={
              item.kind === 'run' ? `Inspect run ${item.run.id}` : `View agent ${item.identity.id}`
            }
            title={`${actor} · ${name}. ${health.error ? 'Activity refresh failed; last known status. ' : ''}${item.relation === 'owner-session' ? 'Owner’s session is running; work on this issue is not confirmed.' : item.label}`}
          >
            <span
              className={cn(
                'agent-status',
                !health.error && `agent-status-${item.run?.status ?? 'unknown'}`,
              )}
            >
              <span className="agent-dot" />
              <strong className="truncate">{name}</strong>
              <span className="ml-auto whitespace-nowrap text-[9px]">
                {health.error ? 'Last seen: ' : ''}
                {item.label}
              </span>
            </span>
            <span className="truncate text-[10px] text-muted-foreground">{actor}</span>
            {item.kind === 'identity' && item.run?.status === 'running' && (
              <AgentLogHint
                workspace={workspace}
                identityStrandId={item.identity.strandId}
                stale={health.error !== null}
              />
            )}
          </button>
        );
      })}
      {!agents.some(({ identity }) => identity?.id === owner) && owner && (
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
