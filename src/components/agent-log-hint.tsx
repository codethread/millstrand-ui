import { Activity, ArrowUpRight } from 'lucide-react';
import { useLogBinding } from '../hooks/use-log-activity';
import { briefEvent } from '../lib/agent-logs';
import { clock } from '../lib/session-log';
import { useLogUiStore } from '../log-ui-store';

interface HintProps {
  workspace: string | null;
  identity: string;
  stale?: boolean;
}
export function AgentLogHint({ workspace, identity, stale = false }: HintProps) {
  const binding = useLogBinding(workspace, identity);
  const activity = binding.data?.activity;
  return (
    <span
      className="mt-2 flex min-w-0 items-center gap-1.5 border-t border-border pt-2 text-[10px] text-muted-foreground"
      title="Last recorded local session activity, not agent process status"
    >
      <Activity className="size-3 shrink-0 text-primary" />
      {stale || binding.error ? (
        <span>Activity last known · refresh unavailable</span>
      ) : activity?.kind === 'available' && activity.latest ? (
        <>
          <span className="min-w-0 flex-1 truncate">{briefEvent(activity.latest)}</span>
          <time className="shrink-0 font-mono text-[9px]">{clock(activity.latest.record.ts)}</time>
        </>
      ) : (
        <span>
          {binding.data?.source
            ? activity?.kind === 'unavailable'
              ? 'No local log yet'
              : 'No recent recorded activity'
            : 'No linked local session'}
        </span>
      )}
    </span>
  );
}
interface ButtonProps {
  workspace: string | null;
  identity: string;
  disabled?: boolean;
}
export function AgentLogButton({ workspace, identity, disabled = false }: ButtonProps) {
  const binding = useLogBinding(workspace, identity);
  const open = useLogUiStore((state) => state.open);
  const source = binding.data?.source;
  if (!source) return null;
  return (
    <button
      disabled={disabled}
      className="flex w-full items-center justify-between rounded-b-lg border-t border-border bg-muted/40 px-3 py-2 text-[10px] text-primary hover:bg-accent disabled:opacity-50"
      onClick={() => open(identity, source)}
    >
      <span className="flex items-center gap-1.5">
        <Activity className="size-3" />
        Open activity
      </span>
      <ArrowUpRight className="size-3" />
    </button>
  );
}
