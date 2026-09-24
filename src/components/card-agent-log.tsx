import { Maximize2, Pause, Play, Terminal } from 'lucide-react';
import type { AgentRun } from '../../shared/api';
import type { LogSource } from '../../shared/log-activity';
import { useCardLogAgents, useLogBinding } from '../hooks/use-log-activity';
import { useLogStream } from '../hooks/use-session-log';
import { useWorkspace } from '../hooks/use-workspace';
import { cardLogAgentStatus, cardLogRoster } from '../lib/agent-logs';
import { CardAgentRoster } from './card-agent-roster';
import { clock, eventLabel, eventText } from '../lib/session-log';
import { useLogUiStore } from '../log-ui-store';
import { Button } from './ui/button';

export function AgentSessionLog({
  identity,
  identityStrandId = '',
  run,
}: {
  identity: string;
  identityStrandId?: string;
  run?: AgentRun | null;
}) {
  const binding = useLogBinding(useWorkspace(), identityStrandId);
  const source = run === undefined || run === null ? binding.data?.source : run.session;
  return source ? (
    <section
      className="mb-6 overflow-hidden rounded-lg border border-border"
      aria-label="Agent session log"
    >
      <CompactLog identity={identity} source={source} status={null} />
    </section>
  ) : null;
}
export function CardAgentLog({ owner, target }: { owner: string | null; target: string }) {
  const query = useCardLogAgents(owner, target);
  const candidates = query.data ?? [];
  const chosen = useLogUiStore((state) => state.cardAgent);
  const choose = useLogUiStore((state) => state.setCardAgent);
  const showHistory = useLogUiStore((state) => state.showCardAgentHistory);
  const setShowHistory = useLogUiStore((state) => state.setShowCardAgentHistory);
  const {
    agents: visible,
    selected: agent,
    historyCount,
  } = cardLogRoster(candidates, chosen, showHistory);
  const binding = useLogBinding(
    useWorkspace(),
    agent?.kind === 'identity' ? agent.identity.strandId : '',
  );
  const source =
    agent?.relation === 'target' ? (agent.run?.session ?? null) : (binding.data?.source ?? null);
  return (
    <section
      className="mb-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border"
      aria-label="Agent activity log"
    >
      {(query.error || query.tasksError) && (
        <output className="shrink-0 px-3 py-2 text-xs text-destructive">
          {query.error ? 'Agent directory unavailable. ' : ''}
          {query.tasksError ? 'Task ownership unavailable. ' : ''}
          Available entries may be incomplete or last-known.
        </output>
      )}
      {query.tasksPending && (
        <p className="shrink-0 px-3 py-2 text-xs text-muted-foreground">Loading task owners…</p>
      )}
      {agent ? (
        <CardAgentRoster
          agents={visible}
          selected={agent}
          choose={choose}
          historyCount={historyCount}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
        />
      ) : (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          {query.isPending
            ? 'Loading agents…'
            : query.error || query.tasksError || query.tasksPending
              ? 'Waiting for the full agent list.'
              : 'No feature owner, task owners, or linked runs found.'}
        </p>
      )}
      {agent &&
        (source ? (
          <CompactLog
            key={`${source.provider}/${source.session}`}
            identity={agent.kind === 'identity' ? agent.identity.id : `Run ${agent.run.id}`}
            source={source}
            status={cardLogAgentStatus(agent)}
          />
        ) : (
          <p className="border-t border-border px-3 py-4 text-xs text-muted-foreground">
            {binding.error
              ? 'Local log lookup unavailable.'
              : binding.isPending
                ? 'Looking for a linked session…'
                : 'No local dialogue session is linked to this agent.'}
          </p>
        ))}
    </section>
  );
}
/** Owns this visible compact tail; the fullscreen overlay takes over its SSE subscription. */
export function CompactLog({
  identity,
  source,
  status,
}: {
  identity: string;
  source: LogSource;
  status: string | null;
}) {
  const workspace = useWorkspace();
  const paused = useLogUiStore((state) => state.paused);
  const setPaused = useLogUiStore((state) => state.setPaused);
  const open = useLogUiStore((state) => state.open);
  const expanded = useLogUiStore((state) => state.overlay.kind === 'open');
  const { snapshot, connection } = useLogStream(
    source.provider,
    source.session,
    paused || expanded,
  );
  const events = snapshot?.events.slice(-6) ?? [];
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-[#111820] px-3 py-2 text-[#96a6b8]">
        <span className="flex items-center gap-1.5 font-mono text-[9px]">
          <Terminal className="size-3" />
          {paused
            ? 'paused'
            : connection.kind === 'error'
              ? 'disconnected · retained'
              : 'recent session events'}
        </span>
        <div className="flex gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-6 text-[#bfcddd] hover:bg-white/10 hover:text-white"
            aria-label={paused ? 'Resume activity' : 'Pause activity'}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play className="size-3!" /> : <Pause className="size-3!" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-[#bfcddd] hover:bg-white/10 hover:text-white"
            onClick={() => open(identity, source, workspace)}
          >
            <Maximize2 className="size-3!" />
            Expand
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#111820] px-3 pb-3 font-mono text-[10px] leading-relaxed text-[#c3cfdc]">
        {events.length ? (
          events.map((event) => (
            <div
              key={event.id}
              className="flex gap-2 border-t border-white/5 py-1.5"
              title={eventText(event.record)}
            >
              <time className="shrink-0 text-[#91a2b6]">{clock(event.record.ts)}</time>
              <span className="w-12 shrink-0 truncate text-emerald-300">
                {eventLabel(event.record)}
              </span>
              <span className="min-w-0 flex-1 truncate">{eventText(event.record)}</span>
            </div>
          ))
        ) : (
          <p className="py-4 text-[#91a2b6]">
            {connection.kind === 'error'
              ? 'No readable local dialogue log.'
              : 'Waiting for recorded activity…'}
          </p>
        )}
      </div>
      <div className="flex shrink-0 justify-between gap-2 bg-muted/30 px-3 py-1.5 text-[9px] text-muted-foreground">
        <span>Last 6 events · {source.provider} · session log, not token output</span>
        {status && <span className="whitespace-nowrap">{status}</span>}
      </div>
    </>
  );
}
