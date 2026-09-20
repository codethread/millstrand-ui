import { GitBranch, LayoutGrid, Pin, RefreshCw } from 'lucide-react';
import { useOverview } from '../hooks/use-overview';
import { cn } from '../lib/utils';
import { ErrorNotice, Loading } from './issue-parts';
import { Button } from './ui/button';
import { OverviewLogPolls } from './overview-log-polls';
import { WorkspaceActivity } from './workspace-activity';
import { HiddenWorkspaces, WorkspacePreferenceError } from './workspace-preferences';
import { WorkspaceSwitcher } from './workspace-switcher';

export function Overview() {
  const { discoveryHealth, options, activity, refreshSource, refreshAll } = useOverview();
  const { pinned, busy, other, cardCount, agentCount } = activity;
  const partial = activity.partial || discoveryHealth.kind !== 'live';
  return (
    <main className="h-dvh overflow-y-auto bg-background" aria-label="All weavers overview">
      <OverviewLogPolls />
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-60 max-w-full [&_.workspace-picker]:m-0 [&_.workspace-picker]:w-full">
              <WorkspaceSwitcher workspace={null} />
            </div>
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw />
              Refresh all
            </Button>
          </div>
        </header>
        <WorkspacePreferenceError />
        {discoveryHealth.kind === 'failed' && <ErrorNotice error={discoveryHealth.error} />}
        {discoveryHealth.kind === 'failed' && options.length > 0 && (
          <p className="mb-4 text-xs text-destructive">
            Discovery interrupted · showing last-known weavers.
          </p>
        )}
        {discoveryHealth.kind === 'loading' ? (
          <Loading text="Discovering weavers…" />
        ) : discoveryHealth.kind === 'live' && options.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
            No visible weavers. Restore hidden weavers below, or refresh discovery.
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
        {pinned.length > 0 && (
          <section className="mb-5" aria-label="Pinned weavers">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Pin className="size-4" /> Pinned weavers
            </h2>
            <div className="grid items-start gap-5 xl:grid-cols-2">
              {pinned.map((snapshot) => (
                <WorkspaceActivity
                  key={snapshot.workspace.id}
                  activity={snapshot}
                  onRetry={refreshSource}
                />
              ))}
            </div>
          </section>
        )}
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {busy.map((snapshot) => (
            <WorkspaceActivity
              key={snapshot.workspace.id}
              activity={snapshot}
              onRetry={refreshSource}
            />
          ))}
        </div>
        {options.length > 0 && cardCount + agentCount === 0 && (
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
                const { workspace } = snapshot;
                const status =
                  snapshot.status === 'offline'
                    ? 'Offline'
                    : snapshot.status === 'unavailable'
                      ? 'Data unavailable'
                      : snapshot.status === 'loading'
                        ? 'Loading…'
                        : 'No active work';
                return (
                  <details key={workspace.id} className="rounded-lg border border-border bg-card">
                    <summary className="cursor-pointer px-4 py-3 text-xs">
                      <strong>{workspace.name}</strong>
                      <span
                        className={cn(
                          'ml-3',
                          snapshot.status === 'unavailable'
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {status}
                      </span>
                    </summary>
                    <WorkspaceActivity activity={snapshot} onRetry={refreshSource} />
                  </details>
                );
              })}
            </div>
          </section>
        )}
        <HiddenWorkspaces />
      </div>
    </main>
  );
}
