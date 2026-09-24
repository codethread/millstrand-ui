import { Bot, Search, X } from 'lucide-react';
import type { AgentIdentity, AgentRun } from '../../shared/api';
import { useAgentDirectory, useAgentStatus, useAgentSummary } from '../hooks/use-agents';
import { currentRun, runDisplayName, selectAgents, selectUnboundRuns } from '../lib/agents';
import { useActiveAgentsOnly, useAgentQuery, useDashboardActions } from '../lib/navigation';
import { useDashboardStore } from '../store';
import { cn } from '../lib/utils';
import { ErrorNotice, Loading } from './issue-parts';
import { AgentRunStatus } from './agent-status';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function AgentSearchControls() {
  const searchShortcut = useDashboardStore((state) => state.shortcuts.search);
  const agentQuery = useAgentQuery();
  const activeAgentsOnly = useActiveAgentsOnly();
  const { setAgentQuery, toggleActiveAgents } = useDashboardActions();
  return (
    <div className="toolbar-actions">
      <div className="search-field">
        <Search />
        <Input
          id="agent-search"
          aria-label="Search agents"
          placeholder="Identity, alias, model…"
          value={agentQuery}
          onChange={(event) => setAgentQuery(event.target.value)}
        />
        {agentQuery ? (
          <button aria-label="Clear agent search" onClick={() => setAgentQuery('')}>
            <X className="size-3" />
          </button>
        ) : (
          <kbd>{searchShortcut}</kbd>
        )}
      </div>
      <button
        className={cn('closed-toggle', activeAgentsOnly && 'selected')}
        aria-pressed={activeAgentsOnly}
        onClick={toggleActiveAgents}
      >
        <Bot className="size-3.5" />
        Active only
      </button>
    </div>
  );
}

export function AgentDirectory() {
  const directory = useAgentDirectory();
  const summary = useAgentSummary();
  const health = useAgentStatus();
  const agentQuery = useAgentQuery();
  const activeAgentsOnly = useActiveAgentsOnly();
  const { openAgent, openAgentRun, resetAgentFilters } = useDashboardActions();
  if (!directory.data)
    return health.error ? (
      <div className="p-5">
        <ErrorNotice error={health.error} />
        <Button
          onClick={() => {
            void health.refetch();
          }}
        >
          Retry agent activity
        </Button>
      </div>
    ) : (
      <Loading text="Loading agent identities…" />
    );
  const agents = selectAgents(directory.data.identities, agentQuery, activeAgentsOnly);
  const unboundRuns = selectUnboundRuns(directory.data.runs, agentQuery, activeAgentsOnly);
  const entries = agents.length + unboundRuns.length;
  return (
    <div className="agents-canvas">
      <div className="mb-4 pr-10 text-xs text-muted-foreground">
        {entries} {entries === 1 ? 'session' : 'sessions'} ·{' '}
        {health.error
          ? 'Activity refresh interrupted'
          : `${summary.data?.active ?? 0} running or queued`}
        <p className="mt-1">Tracked sessions, not just issue owners. Updated every 5 seconds.</p>
      </div>
      {entries === 0 ? (
        <div className="empty-board rounded-lg">
          <Bot className="size-6" />
          <h2>{summary.data?.total ? 'No matching agents' : 'No agent identities or runs yet'}</h2>
          <p>
            {summary.data?.total
              ? 'Search by identity, harness alias, provider, model, or run ID.'
              : 'Published runs appear immediately; native identities appear after registration.'}
          </p>
          {(agentQuery || activeAgentsOnly) && (
            <Button variant="outline" onClick={resetAgentFilters}>
              Clear agent filters
            </Button>
          )}
        </div>
      ) : (
        <div className="agent-grid">
          {agents.map((agent) => (
            <AgentCard
              key={agent.strandId}
              agent={agent}
              stale={health.error !== null}
              onSelect={() => openAgent(agent.strandId)}
            />
          ))}
          {unboundRuns.map((run) => (
            <UnboundRunCard
              key={run.id}
              run={run}
              stale={health.error !== null}
              onSelect={() => openAgentRun(null, run.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  stale,
  onSelect,
}: {
  agent: AgentIdentity;
  stale: boolean;
  onSelect: () => void;
}) {
  const run = currentRun(agent);
  return (
    <button className="agent-card" onClick={onSelect} aria-label={`View agent ${agent.id}`}>
      <span className="flex items-center justify-between gap-3">
        <Bot className="size-4 text-primary" />
        <AgentRunStatus run={run} stale={stale} />
      </span>
      <strong className="mt-3 block text-sm text-foreground">
        {run === null ? agent.harness : runDisplayName(run)}
      </strong>
      <span className="mt-1 block break-words text-xs text-primary">{agent.id}</span>
      <span className="mt-2 block break-words text-[11px] text-muted-foreground">
        {run?.model ?? agent.model ?? 'Model not recorded'}
      </span>
      {run?.target && <span className="mt-2 block break-words text-xs">{run.title}</span>}
      <span className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[10px] text-muted-foreground">
        <span>{agent.harness}</span>
        <span>{agent.runs.length} runs</span>
        <span>{agent.work.filter((work) => work.state === 'active').length} open owned items</span>
      </span>
    </button>
  );
}

function UnboundRunCard({
  run,
  stale,
  onSelect,
}: {
  run: AgentRun;
  stale: boolean;
  onSelect: () => void;
}) {
  return (
    <button className="agent-card" onClick={onSelect} aria-label={`Inspect run ${run.id}`}>
      <span className="flex items-center justify-between gap-3">
        <Bot className="size-4 text-muted-foreground" />
        <AgentRunStatus run={run} stale={stale} />
      </span>
      <strong className="mt-3 block text-sm text-foreground">{runDisplayName(run)}</strong>
      <span className="mt-1 block break-words text-xs text-muted-foreground">
        Identity registration pending
      </span>
      <span className="mt-2 block break-words text-[11px] text-muted-foreground">
        {run.model ?? 'Model not observed yet'}
      </span>
      {run.target && <span className="mt-2 block break-words text-xs">Target · {run.target}</span>}
      <span className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[10px] text-muted-foreground">
        <span>{run.harness}</span>
        <span className="font-mono">{run.id}</span>
        <span>No published actor</span>
      </span>
    </button>
  );
}
