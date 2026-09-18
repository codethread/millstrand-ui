import {
  Activity,
  Braces,
  ChevronRight,
  FileText,
  MessageSquare,
  Radio,
  Terminal,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { LogEvent } from '../../shared/log-lab';
import { reversed } from '../../shared/array';
import { clock, conversationBlocks, eventLabel, eventText } from '../lib/log-lab';
import { useLabStore } from '../log-lab-store';
import { cn } from '../lib/utils';
function Icon({ event }: { event: LogEvent }) {
  if (event.record.event === 'file') return <FileText size={15} />;
  if (event.record.event === 'prompt' || event.record.event === 'reply')
    return <MessageSquare size={15} />;
  return <Radio size={15} />;
}
function pill(event: LogEvent) {
  return event.record.event === 'prompt'
    ? 'text-amber-600 dark:text-amber-300'
    : event.record.event === 'reply'
      ? 'text-violet-600 dark:text-violet-300'
      : 'text-emerald-600 dark:text-emerald-300';
}
export function ConsoleView({ events }: { events: LogEvent[] }) {
  return (
    <div className="px-3 py-5 font-mono text-[11px] md:px-6">
      <div className="mb-5 flex items-center gap-2 border-b border-white/10 pb-3 text-[#96a6b8]">
        <Terminal size={14} />
        <span>dialogue — read-only tail</span>
        <span className="ml-auto text-[10px]">UTF-8 / JSONL</span>
      </div>
      {events.map((event) => (
        <details key={event.id} className="group border-b border-white/5 py-2 hover:bg-white/5">
          <summary className="flex cursor-pointer list-none items-start gap-3">
            <span className="hidden w-10 shrink-0 text-right text-[#627386] sm:block">
              {event.id}
            </span>
            <time className="shrink-0 text-[#91a2b6]">{clock(event.record.ts)}</time>
            <span
              className={cn(
                'w-20 shrink-0 uppercase',
                event.record.event === 'prompt'
                  ? 'text-amber-300'
                  : event.record.event === 'reply'
                    ? 'text-violet-300'
                    : 'text-emerald-300',
              )}
            >
              {eventLabel(event.record)}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-3 group-open:line-clamp-none">
              {eventText(event.record)}
            </span>
            <ChevronRight size={12} className="shrink-0 group-open:rotate-90" />
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded bg-black/20 p-4 text-[10px] text-[#91a2b6]">
            {JSON.stringify(event.record, null, 2)}
          </pre>
        </details>
      ))}
      <div className="mt-5 flex items-center gap-2 text-[#91a2b6]">
        <span className="text-emerald-300">❯</span> end of recorded events
      </div>
    </div>
  );
}
function EventBody({ event }: { event: LogEvent }) {
  return (
    <div className="markdown max-h-[36rem] overflow-auto">
      <ReactMarkdown disallowedElements={['img']} skipHtml>
        {eventText(event.record)}
      </ReactMarkdown>
    </div>
  );
}
export function ConversationView({ events }: { events: LogEvent[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-5 md:px-10 md:py-8">
      {conversationBlocks(events).map((block) =>
        block.kind === 'tools' ? (
          <details
            key={block.events[0]?.id}
            className="rounded-lg border border-dashed bg-background/50 px-4 py-3"
          >
            <summary className="cursor-pointer text-xs text-muted-foreground">
              <Terminal className="mr-2 inline size-3.5" />
              {block.events.length} tool / file {block.events.length === 1 ? 'event' : 'events'}
              <span className="ml-2 text-[10px]">Expand activity</span>
            </summary>
            <div className="mt-3 space-y-2">
              {block.events.map((event) => (
                <div key={event.id} className="flex gap-3 border-t pt-2 font-mono text-[10px]">
                  <time className="shrink-0 text-muted-foreground">{clock(event.record.ts)}</time>
                  <span className="text-primary">{eventLabel(event.record)}</span>
                  <pre className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {eventText(event.record)}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        ) : (
          <article
            key={block.event.id}
            className={cn(
              'rounded-xl border bg-background p-5',
              block.event.record.event === 'prompt' && 'ml-6 border-primary/20 bg-accent/30',
            )}
          >
            <div className="mb-3 flex items-center gap-2 text-xs">
              <span className={pill(block.event)}>
                <Icon event={block.event} />
              </span>
              <strong>{eventLabel(block.event.record)}</strong>
              <time className="ml-auto text-[10px] text-muted-foreground">
                {clock(block.event.record.ts)}
              </time>
            </div>
            <EventBody event={block.event} />
          </article>
        ),
      )}
    </div>
  );
}
export function InspectorView({ events }: { events: LogEvent[] }) {
  const inspected = useLabStore((s) => s.inspected);
  const setInspected = useLabStore((s) => s.setInspected);
  const selected = events.find((e) => e.id === inspected) ?? events.at(-1);
  const counts = [
    {
      label: 'Messages',
      value: events.filter((e) => ['prompt', 'reply'].includes(e.record.event)).length,
      icon: MessageSquare,
    },
    {
      label: 'Tool / file events',
      value: events.filter((e) => e.record.event === 'file').length,
      icon: Terminal,
    },
    {
      label: 'Unique files',
      value: new Set(events.flatMap((e) => (e.record.file_path ? [e.record.file_path] : []))).size,
      icon: FileText,
    },
  ];
  return (
    <div className="flex min-h-full flex-col">
      <div className="grid grid-cols-3 gap-3 border-b p-4 md:px-8">
        {counts.map((item) => (
          <div key={item.label} className="rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px]">{item.label}</span>
              <item.icon size={13} />
            </div>
            <strong className="mt-1 block text-xl font-medium">{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.15fr)]">
        <section className="max-h-[35vh] overflow-auto border-b p-4 lg:max-h-[52vh] lg:border-r lg:border-b-0">
          <h2 className="mb-4 px-2 text-[10px] tracking-widest text-muted-foreground">
            EVENT TIMELINE · NEWEST FIRST
          </h2>
          {reversed(events).map((event) => (
            <button
              key={event.id}
              aria-pressed={selected?.id === event.id}
              onClick={() => setInspected(event.id)}
              className={cn(
                'mb-1 flex w-full gap-3 rounded-lg border border-transparent p-3 text-left hover:bg-muted',
                selected?.id === event.id && 'border-border bg-accent',
              )}
            >
              <span className={cn('mt-1', pill(event))}>
                <Icon event={event} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-[11px]">
                  <strong>{eventLabel(event.record)}</strong>
                  <time className="text-[10px] text-muted-foreground">
                    {clock(event.record.ts)}
                  </time>
                </div>
                <p className="mt-1 line-clamp-2 break-words text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                  {eventText(event.record)}
                </p>
              </div>
            </button>
          ))}
        </section>
        <section aria-label="Event inspector" className="min-w-0 p-5 md:p-7">
          {selected ? (
            <>
              <div className="mb-5 flex items-center gap-2 text-[10px] tracking-widest text-muted-foreground">
                <Activity size={13} /> EVENT INSPECTOR{' '}
                <code className="ml-auto">offset {selected.id}</code>
              </div>
              <h2 className="mb-1 text-lg font-medium">{eventLabel(selected.record)}</h2>
              <p className="mb-5 text-[11px] text-muted-foreground">
                {new Date(selected.record.ts).toLocaleString()}
              </p>
              <EventBody event={selected} />
              <dl className="mt-6 grid grid-cols-[70px_1fr] gap-3 border-t pt-4 text-[10px]">
                <dt className="text-muted-foreground">Workspace</dt>
                <dd className="break-all">{selected.record.cwd ?? 'Not recorded'}</dd>
                <dt className="text-muted-foreground">Model</dt>
                <dd>{selected.record.model ?? 'Not recorded'}</dd>
                <dt className="text-muted-foreground">Agent</dt>
                <dd>{selected.record.agent_type ?? selected.record.agent_id ?? 'Not recorded'}</dd>
              </dl>
              <details className="mt-5 rounded-lg border p-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  <Braces className="mr-2 inline size-3" />
                  Raw event
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto text-[10px]">
                  {JSON.stringify(selected.record, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an event to inspect its evidence.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
