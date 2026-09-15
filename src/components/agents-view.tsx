import { Bot, Search, X } from 'lucide-react';
import { useEffect } from 'react';
import type { AgentIdentity, AgentRun } from '../../shared/api';
import { useAgents, useAgentReply, useBoard } from '../lib/api';
import { useAgentPromptStore } from '../agent-prompt-store';
import { useReviewCommentStore } from '../review-comment-store';
import { runIsFinished } from '../lib/agent-notifications';
import { Markdown } from './issue-detail';
import {
  agentIsActive,
  currentRun,
  issueAgentActivity,
  issueAgents,
  issueRun,
  runLabel,
  selectAgents,
} from '../lib/agents';
import { formatDate } from '../lib/board';
import { useDashboardNavigation } from '../lib/navigation';
import { useDashboardStore } from '../store';
import { cn } from '../lib/utils';
import { Avatar, ErrorNotice, Loading } from './issue-parts';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';

function RunStatus({ run, stale = false }: { run: AgentRun | null; stale?: boolean }) {
  return (
    <span className={cn('agent-status', !stale && `agent-status-${run?.status ?? 'unknown'}`)}>
      <span className="agent-dot" />
      {stale ? 'Last seen: ' : ''}
      {runLabel(run)}
    </span>
  );
}

/** Ownership is not proof of execution on this issue. Only explicit run targets
 * earn “Working”; a running owner's unrelated session is labelled separately. */
export function IssueAgents({ owner, target }: { owner: string | null; target: string }) {
  const query = useAgents();
  const { openAgent } = useDashboardNavigation();
  const agents = issueAgents(query.data?.identities ?? [], owner, target);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {agents.map((agent) => {
        const run = issueRun(agent, target);
        const activity = issueAgentActivity(agent, target);
        return (
          <button
            key={agent.id}
            className="agent-link"
            onClick={() => openAgent(agent.id)}
            aria-label={`View agent ${agent.id}`}
            title={`${agent.id} · ${run?.alias ?? agent.harness}. ${query.error ? 'Activity refresh failed; last known status. ' : ''}${activity === 'Session running' ? 'Owner’s session is running; work on this issue is not confirmed.' : activity}`}
          >
            <span
              className={cn(
                'agent-status',
                !query.error && `agent-status-${run?.status ?? 'unknown'}`,
              )}
            >
              <span className="agent-dot" />
              <strong className="truncate">{run?.alias ?? agent.harness}</strong>
              <span className="ml-auto whitespace-nowrap text-[9px]">
                {query.error ? 'Last seen: ' : ''}
                {activity}
              </span>
            </span>
            <span className="truncate text-[10px] text-muted-foreground">{agent.id}</span>
          </button>
        );
      })}
      {!agents.some((agent) => agent.id === owner) && owner && (
        <span
          className="flex items-center gap-2"
          title={query.error ? 'Agent activity unavailable' : owner}
        >
          <span className="owner-name">{owner}</span>
          <Avatar owner={owner} />
        </span>
      )}
      {!owner && agents.length === 0 && <span className="text-muted-foreground">Unassigned</span>}
    </div>
  );
}

export function AgentSearchControls() {
  const s = useDashboardStore();
  const nav = useDashboardNavigation();
  return (
    <div className="toolbar-actions">
      <div className="search-field">
        <Search />
        <Input
          id="agent-search"
          aria-label="Search agents"
          placeholder="Identity, alias, model…"
          value={nav.agentQuery}
          onChange={(event) => nav.setAgentQuery(event.target.value)}
        />
        {nav.agentQuery ? (
          <button aria-label="Clear agent search" onClick={() => nav.setAgentQuery('')}>
            <X className="size-3" />
          </button>
        ) : (
          <kbd>{s.shortcuts.search}</kbd>
        )}
      </div>
      <button
        className={cn('closed-toggle', nav.activeAgentsOnly && 'selected')}
        aria-pressed={nav.activeAgentsOnly}
        onClick={nav.toggleActiveAgents}
      >
        <Bot className="size-3.5" />
        Active only
      </button>
    </div>
  );
}

export function AgentsView() {
  const query = useAgents();
  const nav = useDashboardNavigation();
  if (!query.data)
    return query.error ? (
      <div className="p-5">
        <ErrorNotice error={query.error} />
        <Button
          onClick={() => {
            void query.refetch();
          }}
        >
          Retry agent activity
        </Button>
      </div>
    ) : (
      <Loading text="Loading agent identities…" />
    );
  const agents = selectAgents(query.data.identities, nav.agentQuery, nav.activeAgentsOnly);
  return (
    <div className="agents-canvas">
      <div className="mb-4 pr-10 text-xs text-muted-foreground">
        {agents.length} {agents.length === 1 ? 'identity' : 'identities'} ·{' '}
        {query.error
          ? 'Activity refresh interrupted'
          : `${query.data.identities.filter(agentIsActive).length} running or queued`}
        <p className="mt-1">Tracked sessions, not just issue owners. Updated every 5 seconds.</p>
      </div>
      {agents.length === 0 ? (
        <div className="empty-board rounded-lg">
          <Bot className="size-6" />
          <h2>{query.data.identities.length ? 'No matching agents' : 'No agent identities yet'}</h2>
          <p>
            {query.data.identities.length
              ? 'Search by identity, harness alias, provider, or model.'
              : 'Identities appear when a harness session is registered in this workspace.'}
          </p>
          {(nav.agentQuery || nav.activeAgentsOnly) && (
            <Button variant="outline" onClick={nav.resetAgentFilters}>
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
              stale={!!query.error}
              onSelect={() => nav.openAgent(agent.id)}
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
        <RunStatus run={run} stale={stale} />
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

export function AgentDetail({ id }: { id: string }) {
  const query = useAgents();
  const { closeAgent, openCard, agentRun, focusAgentRun } = useDashboardNavigation();
  const agent = query.data?.identities.find((item) => item.id === id);
  const run = agent ? currentRun(agent) : null;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) closeAgent();
      }}
    >
      <SheetContent className="issue-sheet sm:max-w-[650px]">
        <div className="detail-heading pr-12">
          <SheetTitle className="break-words">{id}</SheetTitle>
          <SheetDescription>
            Agent identity · read-only session and work inspection
          </SheetDescription>
          {agent && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <strong className="text-primary">{run?.alias ?? agent.harness}</strong>
              <RunStatus run={run} stale={!!query.error} />
            </div>
          )}
        </div>
        {query.error && <ErrorNotice error={query.error} />}
        {!query.data ? (
          query.error ? (
            <Button
              className="m-6"
              variant="outline"
              onClick={() => {
                void query.refetch();
              }}
            >
              Retry identity
            </Button>
          ) : (
            <Loading text="Loading identity…" />
          )
        ) : !agent ? (
          <p className="p-6 text-sm text-muted-foreground">
            This identity was not found in the selected workspace.
          </p>
        ) : (
          <div className="detail-body border-t border-border">
            <section className="detail-section">
              <h3 className="detail-section-title">Run history · {agent.runs.length}</h3>
              {agent.runs.length === 0 && (
                <p className="detail-empty">
                  No published tracked runs. This identity’s live activity is unknown.
                </p>
              )}
              {agent.runs.map((item) => (
                <details
                  key={item.id}
                  className="agent-run"
                  open={item.id === (agentRun ?? run?.id)}
                >
                  <summary
                    onClick={(event) => {
                      event.preventDefault();
                      focusAgentRun(item.id);
                    }}
                  >
                    <span className="font-medium">{item.alias}</span>{' '}
                    <span className="issue-id">{item.id}</span>
                    <RunStatus run={item} stale={!!query.error} />
                  </summary>
                  <p className="mb-4 mt-3 text-sm">{item.title}</p>
                  {item.id === (agentRun ?? run?.id) && <AgentRunReply id={item.id} />}
                  <dl className="property-list">
                    <dt>Provider</dt>
                    <dd>
                      {item.harness} · {item.mode}
                    </dd>
                    <dt>Model</dt>
                    <dd>{item.model ?? 'Not recorded'}</dd>
                    <dt>Effort</dt>
                    <dd>{item.effort ?? 'Not recorded'}</dd>
                    <dt>Directory</dt>
                    <dd className="font-mono text-xs">{item.cwd ?? 'Not recorded'}</dd>
                    <dt>Target</dt>
                    <dd>{item.target ?? 'No explicit target'}</dd>
                    {item.rootTargets.length > 0 && (
                      <>
                        <dt>Work roots</dt>
                        <dd>{item.rootTargets.join(', ')}</dd>
                      </>
                    )}
                    <dt>Started</dt>
                    <dd>{item.startedAt ?? 'Not recorded'}</dd>
                    <dt>Finished</dt>
                    <dd>{item.finishedAt ?? 'Not recorded'}</dd>
                  </dl>
                </details>
              ))}
            </section>
            <dl className="property-list mb-7">
              <dt>Provider</dt>
              <dd>{run?.harness ?? agent.harness}</dd>
              <dt>Model</dt>
              <dd>{run?.model ?? agent.model ?? 'Not recorded'}</dd>
              <dt>Effort</dt>
              <dd>{run?.effort ?? agent.effort ?? 'Not recorded'}</dd>
              <dt>Created</dt>
              <dd>{formatDate(agent.createdAt)}</dd>
              <dt>Identity strand</dt>
              <dd className="font-mono">{agent.strandId}</dd>
            </dl>
            <section className="detail-section">
              <h3 className="detail-section-title">Owned work · {agent.work.length}</h3>
              <p className="detail-empty mb-3">
                Ownership can outlast a session. A running session alone does not prove work on
                every owned item.
              </p>
              {agent.work.map((work) => (
                <div key={work.id} className="relation-row flex-wrap">
                  <span className="issue-id">{work.id}</span>
                  {work.kind === 'card' ? (
                    <button
                      className="text-left hover:text-primary"
                      onClick={() => openCard(work.id)}
                    >
                      {work.title}
                    </button>
                  ) : (
                    <span>{work.title}</span>
                  )}
                  <span className="ml-auto text-[10px]">
                    {work.kind} · {work.state}
                  </span>
                </div>
              ))}
              {agent.work.length === 0 && (
                <p className="detail-empty">
                  No work currently records this identity as its owner.
                </p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AgentRunReply({ id }: { id: string }) {
  const query = useAgentReply(id, true);
  const board = useBoard();
  const nav = useDashboardNavigation();
  const markRead = useAgentPromptStore((s) => s.markRead);
  const reply = query.data;
  useEffect(() => {
    if (nav.workspace && reply && runIsFinished(reply) && !query.error) markRead(nav.workspace, id);
  }, [nav.workspace, id, reply, query.error, markRead]);
  const cardId = reply?.prompt?.cardId ?? reply?.target ?? null;
  const card = board.data?.cards.find((card) => card.id === cardId);
  return (
    <section className="mb-5 space-y-3" aria-label="Prompt and agent reply">
      {reply?.prompt && reply.prompt.kind !== 'card' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (reply.prompt?.kind === 'review-comment')
              useReviewCommentStore.getState().focusComment({
                reviewId: reply.prompt.cardId,
                commentId: reply.prompt.comment.id,
              });
            if (cardId) nav.openReview(cardId);
          }}
        >
          {reply.prompt.kind === 'review-comment' ? 'View comment' : 'View review'} ·{' '}
          {reply.prompt.kind === 'review-comment' ? reply.prompt.comment.id : reply.prompt.cardId}
        </Button>
      ) : (
        card && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (reply?.target !== card.id) nav.exploreGraph(card.id);
              else nav.openCard(card.id);
            }}
          >
            View work · {card.id}
          </Button>
        )
      )}
      {reply?.prompt && (
        <div className="rounded-lg bg-accent p-3">
          <h4 className="mb-2 text-xs font-semibold">Your prompt</h4>
          <p className="whitespace-pre-wrap break-words text-sm">{reply.prompt.text}</p>
          {reply.prompt.kind !== 'card' && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer">Review context sent to agent</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">{reply.prompt.context}</pre>
            </details>
          )}
        </div>
      )}
      {query.error && (
        <div role="alert" className="text-xs text-destructive">
          Reply unavailable: {query.error.message}{' '}
          <button
            className="underline"
            onClick={() => {
              void query.refetch();
            }}
          >
            Retry reply
          </button>
        </div>
      )}
      {!reply ? (
        !query.error && <Loading text="Loading reply…" />
      ) : (
        <>
          {reply.error && (
            <p role="alert" className="break-words text-xs text-destructive">
              {reply.error}
            </p>
          )}
          {reply.result !== null ? (
            <div className="rounded-lg border border-border p-3">
              <h4 className="mb-2 text-xs font-semibold">Agent reply</h4>
              <Markdown text={reply.result} />
            </div>
          ) : (
            <p role="status" className="text-xs text-muted-foreground">
              {reply.status === 'ready'
                ? 'Queued · waiting for the agent to start.'
                : reply.status === 'running'
                  ? 'Working on your prompt. The reply will appear here.'
                  : reply.status === 'unknown'
                    ? 'Run state is unavailable. Waiting for an update.'
                    : 'This run ended without a reply.'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
