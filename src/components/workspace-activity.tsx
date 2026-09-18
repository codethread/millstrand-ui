import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Bot, GitBranch } from 'lucide-react';
import type { WorkspaceOption } from '../../shared/api';
import { currentRun, runLabel } from '../lib/agents';
import { workspaceActivityDestination } from '../lib/dashboard-search';
import type { WorkspaceActivityModel } from '../lib/overview';
import { cn } from '../lib/utils';
import { Loading, StatusBadge } from './issue-parts';
import { WeaverAgentSetting } from './agent-prompt';
import { AgentLogHint, AgentLogButton } from './agent-log-hint';

export function WorkspaceActivity({
  activity: { workspace, board, agents, status },
  onRetry,
}: {
  activity: WorkspaceActivityModel;
  onRetry: (workspace: WorkspaceOption, source: 'board' | 'agents') => void;
}) {
  const online = workspace.status === 'running';
  const cards = board.data ?? [];
  const activeAgents = agents.data ?? [];
  const staleBoard = !online || board.health.kind === 'failed';
  const staleAgents = !online || agents.health.kind === 'failed';
  const dashboardDestination = workspaceActivityDestination(workspace, { kind: 'board' });
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          {dashboardDestination ? (
            <Link
              to="/"
              search={dashboardDestination}
              className="flex items-center gap-2 font-semibold hover:text-primary"
            >
              <GitBranch className="size-4 shrink-0 text-primary" />
              <span className="break-all">{workspace.name}</span>
              <ArrowUpRight className="size-3.5 shrink-0" />
            </Link>
          ) : (
            <div
              className="flex items-center gap-2 font-semibold text-muted-foreground"
              title="Dashboard unavailable while this weaver is offline"
            >
              <GitBranch className="size-4 shrink-0" />
              <span className="break-all">{workspace.name}</span>
            </div>
          )}
          <p className="mt-1 break-all text-[10px] text-muted-foreground">
            {workspace.path.replace(/\/\.millstrand$/, '')}
          </p>
        </div>
        <span
          className={cn(
            'text-xs',
            !online
              ? 'text-muted-foreground'
              : status === 'unavailable'
                ? 'text-destructive'
                : 'text-primary',
          )}
        >
          {!online
            ? 'Offline · last-known data only · links unavailable'
            : status === 'unavailable'
              ? 'Partially disconnected'
              : status === 'loading'
                ? 'Connecting…'
                : 'Live · 5s refresh'}
        </span>
      </header>
      <WeaverAgentSetting workspace={workspace} />
      <div className="grid min-w-0 lg:grid-cols-2">
        <section className="min-w-0 p-4" aria-label={`${workspace.name} active cards`}>
          <h3 className="mb-3 text-xs font-semibold">
            In progress / review / production{' '}
            <span className="text-muted-foreground">
              · {board.data ? cards.length : '—'}
              {staleBoard && board.data ? ' last known' : ''}
            </span>
          </h3>
          {board.health.kind === 'failed' && (
            <div role="alert" className="mb-3 text-xs text-destructive">
              Cards unavailable{board.data ? ' · showing last-known work' : ''}.{' '}
              <button
                className="underline disabled:opacity-50"
                disabled={!online}
                onClick={() => {
                  onRetry(workspace, 'board');
                }}
              >
                Retry cards
              </button>
              <p className="mt-1 break-words">{board.health.message}</p>
            </div>
          )}
          {!board.data && online && board.health.kind === 'loading' && (
            <Loading text="Loading cards…" />
          )}
          {!board.data && !online && (
            <p className="text-xs text-muted-foreground">
              Card data unavailable while this weaver is offline.
            </p>
          )}
          {board.data && cards.length === 0 && (
            <p className="py-3 text-xs text-muted-foreground">
              {staleBoard
                ? 'No in-progress, review, or production cards in the last snapshot.'
                : 'No in-progress, review, or production cards.'}
            </p>
          )}
          <div className="space-y-2">
            {cards.map((card) => {
              const destination = workspaceActivityDestination(workspace, {
                kind: 'card',
                id: card.id,
              });
              const content = (
                <>
                  <span className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="issue-id">{card.id}</span>
                    <StatusBadge status={card.lane} />
                    <span className="ml-auto uppercase text-muted-foreground">{card.priority}</span>
                  </span>
                  <strong className="mt-2 block break-words text-sm">{card.title}</strong>
                  <span className="mt-2 block break-all text-[11px] text-muted-foreground">
                    {card.owner ?? 'Unassigned'}
                    {staleBoard ? ' · last known' : ''}
                  </span>
                </>
              );
              return destination ? (
                <Link
                  key={card.id}
                  to="/"
                  search={destination}
                  className="block rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-accent"
                  aria-label={`Open ${card.title} in ${workspace.name}`}
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={card.id}
                  className="rounded-lg border border-border p-3 opacity-70"
                  title="Card unavailable while this weaver is offline"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </section>
        <section
          className="min-w-0 border-t border-border p-4 lg:border-l lg:border-t-0"
          aria-label={`${workspace.name} active agents`}
        >
          <h3 className="mb-3 text-xs font-semibold">
            Active agents{' '}
            <span className="text-muted-foreground">
              · {agents.data ? activeAgents.length : '—'}
              {staleAgents && agents.data ? ' last known' : ''}
            </span>
          </h3>
          {agents.health.kind === 'failed' && (
            <div role="alert" className="mb-3 text-xs text-destructive">
              Agents unavailable{agents.data ? ' · showing last-known sessions' : ''}.{' '}
              <button
                className="underline disabled:opacity-50"
                disabled={!online}
                onClick={() => {
                  onRetry(workspace, 'agents');
                }}
              >
                Retry agents
              </button>
              <p className="mt-1 break-words">{agents.health.message}</p>
            </div>
          )}
          {!agents.data && online && agents.health.kind === 'loading' && (
            <Loading text="Loading agents…" />
          )}
          {!agents.data && !online && (
            <p className="text-xs text-muted-foreground">
              Agent data unavailable while this weaver is offline.
            </p>
          )}
          {agents.data && activeAgents.length === 0 && (
            <p className="py-3 text-xs text-muted-foreground">
              {staleAgents
                ? 'No active agents in the last snapshot.'
                : 'No running or queued agents.'}
            </p>
          )}
          <div className="space-y-2">
            {activeAgents.map((agent) => {
              const run = currentRun(agent);
              const destination = workspaceActivityDestination(workspace, {
                kind: 'agent',
                id: agent.id,
              });
              const content = (
                <>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <Bot className="size-4 text-primary" />
                    <strong className="break-all">{run?.alias ?? agent.harness}</strong>
                    <span
                      className={cn(
                        'agent-status ml-auto',
                        !staleAgents && `agent-status-${run?.status ?? 'unknown'}`,
                      )}
                    >
                      <span className="agent-dot" />
                      {staleAgents ? 'Last seen: ' : ''}
                      {runLabel(run)}
                    </span>
                  </span>
                  <span className="mt-2 block break-all text-[11px] text-primary">{agent.id}</span>
                  <span className="mt-1 block break-words text-[11px] text-muted-foreground">
                    {run?.model ?? agent.model ?? 'Model not recorded'}
                  </span>
                  {run?.target && (
                    <span className="mt-2 block break-all text-[10px] text-muted-foreground">
                      Target · {run.target}
                    </span>
                  )}
                  <AgentLogHint workspace={workspace.id} identity={agent.id} stale={staleAgents} />
                </>
              );
              return destination ? (
                <div key={agent.id} className="overflow-hidden rounded-lg border border-border">
                  <Link
                    to="/"
                    search={destination}
                    className="block p-3 transition-colors hover:bg-accent"
                    aria-label={`View agent ${agent.id} in ${workspace.name}`}
                  >
                    {content}
                  </Link>
                  <AgentLogButton
                    workspace={workspace.id}
                    identity={agent.id}
                    disabled={staleAgents}
                  />
                </div>
              ) : (
                <div
                  key={agent.id}
                  className="rounded-lg border border-border p-3 opacity-70"
                  title="Agent unavailable while this weaver is offline"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </article>
  );
}
