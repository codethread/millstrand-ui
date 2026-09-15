import { Link } from '@tanstack/react-router';
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { ArrowUpRight, Bot, GitBranch, LayoutGrid, RefreshCw } from 'lucide-react';
import type { AgentDirectory, Board, WorkspaceOption } from '../../shared/api';
import { agentQueryOptions, boardQueryOptions, useWorkspaces } from '../lib/api';
import { currentRun, runLabel, selectAgents } from '../lib/agents';
import { workspaceActivityDestination } from '../lib/dashboard-search';
import { overviewCards } from '../lib/overview';
import { cn } from '../lib/utils';
import { ErrorNotice, Loading, StatusBadge } from './issue-parts';
import { Button } from './ui/button';
import { WeaverAgentSetting } from './agent-prompt';

interface WorkspaceSnapshot {
  workspace: WorkspaceOption;
  board: UseQueryResult<Board>;
  agents: UseQueryResult<AgentDirectory>;
}

function WorkspaceActivity({ workspace, board, agents }: WorkspaceSnapshot) {
  const online = workspace.status === 'running';
  const cards = overviewCards(board.data?.cards ?? []);
  const activeAgents = selectAgents(agents.data?.identities ?? [], '', true);
  const staleBoard = !online || !!board.error;
  const staleAgents = !online || !!agents.error;
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
              : board.error || agents.error
                ? 'text-destructive'
                : 'text-primary',
          )}
        >
          {!online
            ? 'Offline · last-known data only · links unavailable'
            : board.error || agents.error
              ? 'Partially disconnected'
              : board.isPending || agents.isPending
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
          {board.error && (
            <div role="alert" className="mb-3 text-xs text-destructive">
              Cards unavailable{board.data ? ' · showing last-known work' : ''}.{' '}
              <button
                className="underline"
                onClick={() => {
                  void board.refetch();
                }}
              >
                Retry cards
              </button>
              <p className="mt-1 break-words">{board.error.message}</p>
            </div>
          )}
          {!board.data && online && board.isPending && <Loading text="Loading cards…" />}
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
          {agents.error && (
            <div role="alert" className="mb-3 text-xs text-destructive">
              Agents unavailable{agents.data ? ' · showing last-known sessions' : ''}.{' '}
              <button
                className="underline"
                onClick={() => {
                  void agents.refetch();
                }}
              >
                Retry agents
              </button>
              <p className="mt-1 break-words">{agents.error.message}</p>
            </div>
          )}
          {!agents.data && online && agents.isPending && <Loading text="Loading agents…" />}
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
                </>
              );
              return destination ? (
                <Link
                  key={agent.id}
                  to="/"
                  search={destination}
                  className="block rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-accent"
                  aria-label={`View agent ${agent.id} in ${workspace.name}`}
                >
                  {content}
                </Link>
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

export function Overview() {
  const workspaces = useWorkspaces();
  const client = useQueryClient();
  const options = workspaces.data ?? [];
  const boards = useQueries({
    queries: options.map((workspace) => ({
      ...boardQueryOptions(workspace.id),
      enabled: workspace.status === 'running',
    })),
  });
  const agentQueries = useQueries({
    queries: options.map((workspace) => ({
      ...agentQueryOptions(workspace.id),
      enabled: workspace.status === 'running',
    })),
  });
  // useQueries returns one result per input, in the same order.
  const snapshots = options.map((workspace, index): WorkspaceSnapshot => ({
    workspace,
    board: boards[index]!,
    agents: agentQueries[index]!,
  }));
  const busy = snapshots.filter(
    ({ board, agents }) =>
      overviewCards(board.data?.cards ?? []).length > 0 ||
      selectAgents(agents.data?.identities ?? [], '', true).length > 0,
  );
  const other = snapshots.filter((snapshot) => !busy.includes(snapshot));
  const cardCount = busy.reduce(
    (count, { board }) => count + overviewCards(board.data?.cards ?? []).length,
    0,
  );
  const agentCount = busy.reduce(
    (count, { agents }) => count + selectAgents(agents.data?.identities ?? [], '', true).length,
    0,
  );
  const partial = snapshots.some(
    ({ workspace, board, agents }) =>
      workspace.status !== 'running' || !board.data || !agents.data || board.error || agents.error,
  );
  return (
    <main className="h-dvh overflow-y-auto bg-background" aria-label="All weavers overview">
      <div className="mx-auto max-w-[1600px] p-4 sm:p-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-primary">
              <GitBranch className="size-5" />
              millstrand.
            </div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <LayoutGrid className="size-5" />
              All weavers
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Work in motion, across your dashboards.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              In-progress, review, and production cards · running, queued, or stopping sessions.
              Tracked process state, not token activity.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void client.invalidateQueries();
            }}
          >
            <RefreshCw />
            Refresh all
          </Button>
        </header>
        {workspaces.error && <ErrorNotice error={workspaces.error} />}
        {workspaces.error && workspaces.data && (
          <p className="mb-4 text-xs text-destructive">
            Discovery interrupted · showing last-known weavers.
          </p>
        )}
        {workspaces.isPending ? (
          <Loading text="Discovering weavers…" />
        ) : !workspaces.error && options.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
            No local weavers discovered.
          </p>
        ) : null}
        {options.length > 0 && (
          <p className="mb-4 text-xs text-muted-foreground">
            {options.length} weavers ·{' '}
            {options.filter((workspace) => workspace.status === 'running').length} online · select
            any item to open its workspace
          </p>
        )}
        {options.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg border border-border bg-card px-4 py-3">
              <strong>{cardCount}</strong> in progress / review / production
            </span>
            <span className="rounded-lg border border-border bg-card px-4 py-3">
              <strong>{agentCount}</strong> active agents
            </span>
            {partial && (
              <span className="self-center text-xs text-muted-foreground">
                Partial / last-known counts · see workspace status below
              </span>
            )}
          </div>
        )}
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {busy.map((snapshot) => (
            <WorkspaceActivity key={snapshot.workspace.id} {...snapshot} />
          ))}
        </div>
        {options.length > 0 && busy.length === 0 && (
          <p className="mb-5 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
            {partial
              ? 'No activity in the available snapshots yet. Some weavers are loading or unavailable.'
              : 'No in-progress, review, or production cards, or active agents across your weavers.'}
          </p>
        )}
        {other.length > 0 && (
          <section className="mt-6" aria-label="Other weavers">
            <h2 className="mb-3 text-sm font-semibold">Other weavers · {other.length}</h2>
            <div className="space-y-2">
              {other.map((snapshot) => {
                const { workspace, board, agents } = snapshot;
                const status =
                  workspace.status === 'offline'
                    ? 'Offline'
                    : board.error || agents.error
                      ? 'Data unavailable'
                      : board.isPending || agents.isPending
                        ? 'Loading…'
                        : 'No active work';
                return (
                  <details key={workspace.id} className="rounded-lg border border-border bg-card">
                    <summary className="cursor-pointer px-4 py-3 text-xs">
                      <strong>{workspace.name}</strong>
                      <span
                        className={cn(
                          'ml-3',
                          board.error || agents.error
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {status}
                      </span>
                    </summary>
                    <WorkspaceActivity {...snapshot} />
                  </details>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
