import type { ReactNode } from 'react';
import { ArrowUpRight, Bell, Bot, Clock3, Inbox } from 'lucide-react';
import type { CockpitSection } from '../cockpit-store';
import { currentRun, runLabel } from '../lib/agents';
import { useDashboardActions } from '../lib/navigation';
import type { AgentPulse, CockpitAgent, CockpitCard } from '../lib/overview';
import { cn } from '../lib/utils';
import { AttentionSettings } from './attention-settings';
import { AgentLogHint, AgentLogButton } from './agent-log-hint';

function Pulse({ pulse }: { pulse: AgentPulse }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-2 py-1 text-[10px]',
        pulse.kind === 'quiet'
          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
          : 'bg-muted text-muted-foreground',
      )}
      title={'timestamp' in pulse ? pulse.timestamp : undefined}
    >
      {pulse.kind === 'quiet'
        ? `Quiet · ${pulse.age}`
        : pulse.kind === 'recent'
          ? `Last event · ${pulse.age}`
          : pulse.kind === 'last-known'
            ? 'Last-known activity'
            : 'Log unavailable'}
    </span>
  );
}

function Section({
  title,
  count,
  icon,
  children,
  action,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="min-w-0" aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{count}</span>
        {action}
      </h2>
      {children}
    </section>
  );
}

function CardRow({ item }: { item: CockpitCard }) {
  const { inspectOverviewCard } = useDashboardActions();
  const reason = item.reason;
  return (
    <button
      onClick={() => inspectOverviewCard(item.workspace.id, item.card.id)}
      disabled={item.workspace.status !== 'running'}
      className="block w-full border-b border-border px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-accent/40 disabled:opacity-60"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-medium text-primary">{item.workspace.name}</span>
        <span className="font-mono text-muted-foreground">{item.card.id}</span>
        <span className="ml-auto text-[10px] uppercase text-muted-foreground">
          {item.card.priority}
        </span>
        <ArrowUpRight className="size-3 text-muted-foreground" />
      </div>
      <h3 className="mb-1 break-words text-sm font-semibold leading-relaxed">{item.card.title}</h3>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={cn(
            'rounded px-2 py-0.5',
            reason
              ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
              : 'bg-accent text-primary',
          )}
        >
          {reason ?? 'In review'}
        </span>
        {item.card.owner && <span className="text-muted-foreground">{item.card.owner}</span>}
        {item.stale && <span className="text-destructive">Last-known card</span>}
      </div>
    </button>
  );
}

function QuietRow({ agent }: { agent: CockpitAgent }) {
  const { inspectOverviewAgent } = useDashboardActions();
  return (
    <button
      disabled={agent.workspace.status !== 'running'}
      onClick={() => inspectOverviewAgent(agent.workspace.id, agent.identity.id)}
      className="block w-full min-w-0 border-b border-border px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-accent/40 disabled:opacity-60"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Clock3 className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <strong className="min-w-0 flex-1 break-words text-sm">{agent.identity.id}</strong>
        <Pulse pulse={agent.pulse} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{agent.workspace.name} · process running</p>
      {agent.target && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed">{agent.target.title}</p>
      )}
      <AgentLogHint
        workspace={agent.workspace.id}
        identityStrandId={agent.identity.strandId}
        stale={agent.stale}
      />
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-4 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function AttentionCentre({
  attention,
  review,
  quiet,
  section,
  partial,
}: {
  attention: CockpitCard[];
  review: CockpitCard[];
  quiet: CockpitAgent[];
  section: CockpitSection;
  partial: boolean;
}) {
  const container = 'overflow-hidden rounded-xl border border-border bg-card';
  const attentionSection = (
    <Section
      action={<AttentionSettings />}
      title="Needs your attention"
      count={attention.length}
      icon={<Bell className="size-4 text-amber-700 dark:text-amber-300" />}
    >
      {attention.length ? (
        <div className={container}>
          {attention.map((item) => (
            <CardRow key={`${item.workspace.id}:${item.card.id}`} item={item} />
          ))}
        </div>
      ) : (
        <Empty>
          {partial
            ? 'No matching attention labels in the available data.'
            : 'No cards match your attention labels.'}
        </Empty>
      )}
    </Section>
  );
  const reviewSection = (
    <Section
      title="Ready for a look"
      count={review.length}
      icon={<Inbox className="size-4 text-primary" />}
    >
      {review.length ? (
        <div className={container}>
          {review.map((item) => (
            <CardRow key={`${item.workspace.id}:${item.card.id}`} item={item} />
          ))}
        </div>
      ) : (
        <Empty>
          {partial ? 'No review cards in the available data.' : 'Nothing awaiting a look.'}
        </Empty>
      )}
    </Section>
  );
  const quietSection = (
    <Section
      title="Running, but quiet"
      count={quiet.length}
      icon={<Clock3 className="size-4 text-amber-700 dark:text-amber-300" />}
    >
      {quiet.length ? (
        <div className={container}>
          {quiet.map((agent) => (
            <QuietRow key={`${agent.workspace.id}:${agent.identity.strandId}`} agent={agent} />
          ))}
        </div>
      ) : (
        <Empty>No quiet running agents in the available logs.</Empty>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        No recorded event for 5+ minutes. Quiet doesn’t necessarily mean stuck.
      </p>
    </Section>
  );
  if (section === 'attention') return attentionSection;
  if (section === 'review') return reviewSection;
  if (section === 'quiet') return quietSection;
  return (
    <div className="space-y-5">
      {attentionSection}
      {reviewSection}
      {quietSection}
    </div>
  );
}

export function ActivityRail({ agents }: { agents: CockpitAgent[] }) {
  const { inspectOverviewAgent, inspectOverviewCard } = useDashboardActions();
  return (
    <aside
      className="min-w-0 border-t border-border pt-5 xl:sticky xl:top-5 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:self-start xl:border-t-0 xl:border-l xl:pl-5 xl:pt-0"
      aria-label="On the tools"
    >
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Bot className="size-4 text-primary" />
        On the tools
      </h2>
      <div className="space-y-3">
        {agents.map((agent) => (
          <article
            key={`${agent.workspace.id}:${agent.identity.strandId}`}
            className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
          >
            <button
              disabled={agent.workspace.status !== 'running'}
              className="block w-full p-3 text-left hover:bg-accent/40 disabled:opacity-60"
              onClick={() => inspectOverviewAgent(agent.workspace.id, agent.identity.id)}
            >
              <div className="flex items-start gap-2">
                <strong className="min-w-0 flex-1 break-words text-xs">{agent.identity.id}</strong>
                <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {agent.workspace.name} · {runLabel(currentRun(agent.identity))}
                {agent.stale ? ' · last known' : ''}
              </p>
              <div className="mt-2">
                <Pulse pulse={agent.pulse} />
              </div>
              <AgentLogHint
                workspace={agent.workspace.id}
                identityStrandId={agent.identity.strandId}
                stale={agent.stale}
              />
            </button>
            {agent.target && (
              <button
                onClick={() => inspectOverviewCard(agent.workspace.id, agent.target!.id)}
                disabled={agent.workspace.status !== 'running'}
                className="block w-full border-t border-border px-3 py-2 text-left text-[11px] text-primary hover:bg-accent/40 disabled:opacity-60"
              >
                <span className="line-clamp-2">{agent.target.title}</span>
              </button>
            )}
            <AgentLogButton
              workspace={agent.workspace.id}
              identity={agent.identity.id}
              identityStrandId={agent.identity.strandId}
              disabled={agent.stale}
            />
          </article>
        ))}
        {agents.length === 0 && <Empty>No tracked active agents in this selection.</Empty>}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Recorded session events, not token activity.
      </p>
    </aside>
  );
}
