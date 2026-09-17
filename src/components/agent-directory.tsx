import { Bot, Search, X } from 'lucide-react';
import type { AgentIdentity } from '../../shared/api';
import { useAgentIdentities, useAgentStatus, useAgentSummary } from '../hooks/use-agents';
import { currentRun, selectAgents } from '../lib/agents';
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
  const directory = useAgentIdentities();
  const summary = useAgentSummary();
  const health = useAgentStatus();
  const agentQuery = useAgentQuery();
  const activeAgentsOnly = useActiveAgentsOnly();
  const { openAgent, resetAgentFilters } = useDashboardActions();
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
  const agents = selectAgents(directory.data, agentQuery, activeAgentsOnly);
  return (
    <div className="agents-canvas">
      <div className="mb-4 pr-10 text-xs text-muted-foreground">
        {agents.length} {agents.length === 1 ? 'identity' : 'identities'} ·{' '}
        {health.error
          ? 'Activity refresh interrupted'
          : `${summary.data?.active ?? 0} running or queued`}
        <p className="mt-1">Tracked sessions, not just issue owners. Updated every 5 seconds.</p>
      </div>
      {agents.length === 0 ? (
        <div className="empty-board rounded-lg">
          <Bot className="size-6" />
          <h2>{directory.data.length ? 'No matching agents' : 'No agent identities yet'}</h2>
          <p>
            {directory.data.length
              ? 'Search by identity, harness alias, provider, or model.'
              : 'Identities appear when a harness session is registered in this workspace.'}
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
              key={agent.id}
              agent={agent}
              stale={health.error !== null}
              onSelect={() => openAgent(agent.id)}
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
      <strong className="mt-3 block text-sm text-foreground">{run?.alias ?? agent.harness}</strong>
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
