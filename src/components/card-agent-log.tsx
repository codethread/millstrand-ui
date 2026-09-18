import { Maximize2, Pause, Play, Terminal } from 'lucide-react';
import type { LogSource } from '../../shared/log-activity';
import { useCardLogAgents, useLogBinding } from '../hooks/use-log-activity';
import { useLogStream } from '../hooks/use-log-lab';
import { useWorkspace } from '../hooks/use-workspace';
import { logLabEnabled } from '../lib/agent-logs';
import { runLabel } from '../lib/agents';
import { clock, eventLabel, eventText } from '../lib/log-lab';
import { cn } from '../lib/utils';
import { useLogUiStore } from '../log-ui-store';
import { Button } from './ui/button';

export function CardAgentLog({ owner, target }: { owner: string | null; target: string }) {
  if (!logLabEnabled) return null;
  return <CardLogPanel owner={owner} target={target} />;
}
export function AgentSessionLog({ identity }: { identity: string }) {
  if (!logLabEnabled) return null;
  return <LinkedAgentLog identity={identity} />;
}
function LinkedAgentLog({ identity }: { identity: string }) {
  const binding = useLogBinding(useWorkspace(), identity);
  const source = binding.data?.source;
  return source ? (
    <section
      className="mb-6 overflow-hidden rounded-lg border border-border"
      aria-label="Agent session log"
    >
      <CompactLog identity={identity} source={source} height="compact" status={null} />
    </section>
  ) : null;
}
function CardLogPanel({ owner, target }: { owner: string | null; target: string }) {
  const candidates = useCardLogAgents(owner, target).data ?? [];
  const chosen = useLogUiStore((state) => state.cardAgent);
  const choose = useLogUiStore((state) => state.setCardAgent);
  const agent = candidates.find((candidate) => candidate.identity.id === chosen) ?? candidates[0];
  const binding = useLogBinding(useWorkspace(), agent?.identity.id ?? '');
  if (!agent) return null;
  return (
    <section
      className="mb-6 overflow-hidden rounded-lg border border-border"
      aria-label="Agent activity log"
    >
      <div className="flex flex-wrap items-center gap-2 bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground">
        {candidates.length > 1 ? (
          <select
            aria-label="Activity agent"
            className="min-w-0 max-w-full rounded border border-border bg-background p-1 text-foreground"
            value={agent.identity.id}
            onChange={(event) => choose(event.target.value)}
          >
            {candidates.map((item) => (
              <option key={item.identity.id} value={item.identity.id}>
                {item.run?.alias ?? item.identity.harness} · {item.identity.id}
              </option>
            ))}
          </select>
        ) : (
          <strong className="break-all text-primary">
            {agent.run?.alias ?? agent.identity.harness} · {agent.identity.id}
          </strong>
        )}
        <span>
          {agent.relation === 'owner'
            ? 'Owner session · work on this card not confirmed'
            : 'Session linked to this card'}
        </span>
      </div>
      {binding.data?.source ? (
        <CompactLog
          key={`${binding.data.source.provider}/${binding.data.source.session}`}
          identity={agent.identity.id}
          source={binding.data.source}
          height="roomy"
          status={runLabel(agent.run)}
        />
      ) : (
        <p className="border-t border-border px-3 py-4 text-xs text-muted-foreground">
          {binding.error
            ? 'Local log lookup unavailable.'
            : binding.isPending
              ? 'Looking for a linked session…'
              : 'No local dialogue session is linked to this agent.'}
        </p>
      )}
    </section>
  );
}
/** Owns this visible compact tail; the fullscreen overlay takes over its SSE subscription. */
export function CompactLog({
  identity,
  source,
  height,
  status,
}: {
  identity: string;
  source: LogSource;
  height: 'compact' | 'roomy';
  status: string | null;
}) {
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
      <div className="flex items-center justify-between gap-2 border-t border-border bg-[#111820] px-3 py-2 text-[#96a6b8]">
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
            onClick={() => open(identity, source)}
          >
            <Maximize2 className="size-3!" />
            Expand
          </Button>
        </div>
      </div>
      <div
        className={cn(
          'overflow-auto bg-[#111820] px-3 pb-3 font-mono text-[10px] leading-relaxed text-[#c3cfdc]',
          height === 'roomy' ? 'min-h-[28.5rem] max-h-[34rem]' : 'max-h-56',
        )}
      >
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
      <div className="flex justify-between gap-2 bg-muted/30 px-3 py-1.5 text-[9px] text-muted-foreground">
        <span>Last 6 events · {source.provider} · session log, not token output</span>
        {status && <span className="whitespace-nowrap">{status}</span>}
      </div>
    </>
  );
}
