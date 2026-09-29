import type { ReactNode } from 'react';
import { Activity, Bot } from 'lucide-react';
import type { Card } from '../../shared/api';
import { useAgentStatus, useRelevantAgentActivity } from '../hooks/use-agents';
import { agentActivitySignal } from '../lib/agents';
import { autoRunSignal } from '../lib/board';
import { cn } from '../lib/utils';
import { IssueAgents } from './agent-activity';
import { AutoRunDetails } from './auto-run';
import { CardOwnerSummary } from './card-provenance';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

function Signal({
  label,
  preview,
  icon,
  tone,
  children,
}: {
  label: string;
  preview: ReactNode;
  icon: ReactNode;
  tone: 'neutral' | 'active' | 'auto' | 'error';
  children: ReactNode;
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex min-h-7 items-center gap-1 rounded-md border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:border-primary aria-expanded:border-primary max-sm:min-h-8',
                tone === 'active' &&
                  'border-emerald-600/25 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200',
                tone === 'auto' && 'border-primary/25 bg-accent text-accent-foreground',
                tone === 'error' && 'border-destructive/50 text-destructive',
              )}
              aria-label={`${label} details`}
            >
              {icon}
              {label}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {preview}
          <p className="mt-1">Click or tap for details</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        aria-label={`${label} details`}
        className="max-h-[70dvh] w-80 max-w-[calc(100vw-24px)] space-y-3 overflow-y-auto text-xs [overflow-wrap:anywhere] [&_.detail-section]:mb-0"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function ActivitySignal({ card }: { card: Card }) {
  const activity = useRelevantAgentActivity(card.owner, card.id);
  const health = useAgentStatus();
  const signal = agentActivitySignal(activity.data ?? []);
  if (signal === null && health.error === null && !health.isPending) return null;
  const label = health.error
    ? signal === null
      ? 'Activity unavailable'
      : `Last known: ${signal.label}`
    : (signal?.label ?? 'Activity loading');
  return (
    <Signal
      label={label}
      icon={<Activity className="size-3 shrink-0" />}
      tone={health.error || signal?.error ? 'error' : signal?.active ? 'active' : 'neutral'}
      preview={
        <>
          <p>Recorded agent activity · not the card lane.</p>
          <p>Owner: {card.owner ?? 'Unassigned'}</p>
          {health.error && <p>Refresh failed; activity is last known.</p>}
        </>
      }
    >
      <p className="font-semibold">Recorded agent activity</p>
      <p className="text-muted-foreground">
        Working requires an explicit run target. Session running only describes the owner’s session,
        not work on this card.
      </p>
      {health.error && (
        <p role="alert" className="text-destructive">
          Refresh failed · last known activity: {health.error.message}
        </p>
      )}
      {health.isPending && <p>Loading agent activity…</p>}
      <CardOwnerSummary card={card} />
      <IssueAgents owner={card.owner} target={card.id} />
    </Signal>
  );
}

export function CardSignals({ card }: { card: Card }) {
  const auto = autoRunSignal(card.autoRun);
  return (
    <>
      <ActivitySignal card={card} />
      {auto !== null && card.autoRun !== null && (
        <Signal
          label={auto}
          icon={<Bot className="size-3 shrink-0" />}
          tone={card.autoRun.status === 'error' ? 'error' : 'auto'}
          preview={
            <>
              <p>Auto-run · {card.autoRun.optedIn ? 'Opted in' : 'Not opted in'}</p>
              <p>
                Seat: {card.autoRun.seat ?? 'Not set'} · Effort: {card.autoRun.effort ?? 'Not set'}
              </p>
              <p>Delivery: {card.autoRun.workflow ?? 'Not set'}</p>
              <p>Configuration and dispatch, not worker activity.</p>
            </>
          }
        >
          <AutoRunDetails autoRun={card.autoRun} />
        </Signal>
      )}
    </>
  );
}
