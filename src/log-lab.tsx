import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { ArrowDown, ArrowUpRight, Layers, Pause, Play, Search } from 'lucide-react';
import { ConsoleView, ConversationView, InspectorView } from './components/log-lab-views';
import { z } from 'zod';
import { concepts, providerSchema, type Concept, type LogSession } from '../shared/log-lab';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { createQueryClient } from './lib/api/query-client';
import { clock, filterEvents } from './lib/log-lab';
import { useLogConcept, useLogDirectory, useLogStream } from './hooks/use-log-lab';
import { useLabStore } from './log-lab-store';
import { cn } from './lib/utils';
import './index.css';
import './log-lab.css';

const searchSchema = z.object({
  provider: providerSchema.catch('pi'),
  session: z.string().catch(''),
});
const rootRoute = createRootRoute();
const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (value) => searchSchema.parse(value),
  component: LogLab,
});
const router = createRouter({ routeTree: rootRoute.addChildren([route]) });
const client = createQueryClient();

function sessionName(session: LogSession) {
  return session.cwd?.split('/').at(-1) ?? 'Unknown workspace';
}
function LogLab() {
  const directory = useLogDirectory();
  const config = useLogConcept();
  const search = route.useSearch<typeof router>();
  const navigate = route.useNavigate();
  const provider = useLabStore((s) => s.provider);
  const setProvider = useLabStore((s) => s.setProvider);
  const sessionQuery = useLabStore((s) => s.sessionQuery);
  const setSessionQuery = useLabStore((s) => s.setSessionQuery);
  const sessions = directory.data?.sessions ?? [];
  const selected =
    sessions.find((s) => s.id === search.session && s.provider === search.provider) ??
    (search.session
      ? {
          id: search.session,
          provider: search.provider,
          title: 'Selected dialogue session',
          cwd: null,
          model: null,
          modifiedAt: '',
          bytes: 0,
        }
      : sessions[0]);
  const visible = sessions.filter(
    (s) =>
      (provider === 'all' || s.provider === provider) &&
      `${s.title} ${s.cwd} ${s.id} ${s.model}`.toLowerCase().includes(sessionQuery.toLowerCase()),
  );
  const initial = sessions[0];
  useEffect(() => {
    if (!search.session && initial)
      void navigate({ search: { provider: initial.provider, session: initial.id }, replace: true });
  }, [search.session, initial, navigate]);
  const concept = config.data;
  if (!concept) return <div className="startup">{config.error?.message ?? 'Opening log lab…'}</div>;
  const design = concepts[concept];
  return (
    <div className="log-lab flex h-dvh flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-lg bg-[#d7835c] text-white">
            <Layers size={18} />
          </span>
          <strong className="text-base tracking-tight">
            millstrand<span className="text-[#d7835c]">.</span>
          </strong>
          <span className="border-l pl-3 text-xs text-muted-foreground">
            LOG LAB <span className="ml-2 rounded border px-1.5 py-0.5 text-[10px]">POC</span>
          </span>
        </div>
        <nav aria-label="Compare concepts" className="flex gap-1">
          {Object.entries(concepts).map(([key, item]) => (
            <a
              key={key}
              href={`${location.protocol}//${location.hostname}:${item.port}/${selected ? `?provider=${selected.provider}&session=${encodeURIComponent(selected.id)}` : ''}`}
              className={cn(
                'rounded-md px-3 py-2 text-xs',
                key === concept
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {item.number} <span className="hidden sm:inline">{item.title}</span>
              <ArrowUpRight className="ml-1 inline size-3" />
            </a>
          ))}
        </nav>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="border-b px-4 py-2 md:hidden">
          <label className="flex items-center gap-3 text-xs text-muted-foreground">
            Session
            <select
              aria-label="Choose session"
              className="h-9 min-w-0 flex-1 rounded border bg-background px-2 text-xs text-foreground"
              value={selected ? `${selected.provider}/${selected.id}` : ''}
              onChange={(event) => {
                const next = sessions.find(
                  (item) => `${item.provider}/${item.id}` === event.target.value,
                );
                if (next) {
                  useLabStore.getState().setPaused(false);
                  void navigate({ search: { provider: next.provider, session: next.id } });
                }
              }}
            >
              {!sessions.length && (
                <option value="">
                  {directory.error ? 'Cannot load sessions' : 'Loading sessions…'}
                </option>
              )}
              {sessions.map((item) => (
                <option key={`${item.provider}/${item.id}`} value={`${item.provider}/${item.id}`}>
                  {item.provider} · {sessionName(item)} · {item.title.slice(0, 70)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <aside className="hidden w-72 shrink-0 flex-col border-r bg-muted/20 md:flex">
          <div className="space-y-3 p-4">
            <div className="flex justify-between text-[10px] font-semibold tracking-widest text-muted-foreground">
              <span>RECENT SESSIONS</span>
              <span>{sessions.length}</span>
            </div>
            <Input
              aria-label="Find session"
              placeholder="Find workspace or session…"
              value={sessionQuery}
              onChange={(e) => setSessionQuery(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="flex gap-1">
              {['all', 'pi', 'codex', 'claude'].map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={provider === p ? 'secondary' : 'ghost'}
                  className="h-7 px-2.5 text-[11px] capitalize"
                  onClick={() => setProvider(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
            {directory.isPending && <p className="p-3 text-xs">Reading local log directories…</p>}
            {directory.error && (
              <p role="alert" className="p-3 text-xs text-destructive">
                {directory.error.message}
              </p>
            )}
            {directory.data?.warnings.map((warning) => (
              <p key={warning} className="p-2 text-xs text-destructive">
                {warning}
              </p>
            ))}
            {!directory.isPending && visible.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">No matching sessions.</p>
            )}
            {visible.map((session) => (
              <button
                key={`${session.provider}/${session.id}`}
                aria-pressed={selected?.id === session.id && selected.provider === session.provider}
                onClick={() => {
                  useLabStore.getState().setPaused(false);
                  void navigate({ search: { provider: session.provider, session: session.id } });
                }}
                className={cn(
                  'mb-1 block w-full rounded-lg border border-transparent p-3 text-left hover:bg-muted',
                  selected?.id === session.id &&
                    selected.provider === session.provider &&
                    'border-border bg-accent/60',
                )}
              >
                <div className="mb-2 flex items-center gap-2 text-[10px]">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono uppercase">
                    {session.provider}
                  </span>
                  <span className="truncate text-muted-foreground">{sessionName(session)}</span>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed">{session.title}</p>
                <div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground">
                  <span>{session.id.slice(0, 8)}</span>
                  <span>
                    {new Date(session.modifiedAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · {clock(session.modifiedAt).slice(0, 5)}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="hidden border-t p-4 text-[10px] leading-relaxed text-muted-foreground md:block">
            Read-only local dialogue files.
            <br />
            Latest 30 sessions per harness.
            <br />
            No connection to Harnesses run status.
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b px-5 py-3 md:px-8 md:py-5">
            <div className="mb-2 flex items-center gap-2 text-[10px] tracking-widest text-muted-foreground">
              <span>EXPERIMENT {design.number}</span>
              <span> / </span>
              <span>AGENT OBSERVABILITY</span>
            </div>
            <h1 className="text-2xl">{design.title}</h1>
            <p className="mt-2 text-xs text-muted-foreground">{design.subtitle}</p>
          </div>
          {selected ? (
            <SessionView
              key={`${selected.provider}/${selected.id}`}
              session={selected}
              concept={concept}
            />
          ) : (
            <div className="p-10 text-sm text-muted-foreground">
              Choose a session once local logs are available.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
function SessionView({ session, concept }: { session: LogSession; concept: Concept }) {
  const paused = useLabStore((s) => s.paused);
  const setPaused = useLabStore((s) => s.setPaused);
  const follow = useLabStore((s) => s.follow);
  const setFollow = useLabStore((s) => s.setFollow);
  const query = useLabStore((s) => s.query);
  const setQuery = useLabStore((s) => s.setQuery);
  const kind = useLabStore((s) => s.kind);
  const setKind = useLabStore((s) => s.setKind);
  const { snapshot, connection } = useLogStream(session.provider, session.id, paused);
  const events = filterEvents(snapshot?.events ?? [], query, kind);
  const tail = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = events.at(-1)?.id;
  useEffect(() => {
    if (lastId !== undefined && follow && concept !== 'inspector')
      tail.current?.scrollIntoView({ block: 'end' });
  }, [lastId, follow, concept]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 md:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">
              {session.provider}
            </span>
            <strong>{sessionName(session)}</strong>
            <code className="text-[10px] text-muted-foreground">{session.id.slice(0, 8)}</code>
          </div>
          <p className="mt-1 max-w-xl truncate text-[10px] text-muted-foreground">
            {session.model ?? 'Model not recorded'} ·{' '}
            {snapshot
              ? `Last file write ${new Date(snapshot.modifiedAt).toLocaleString()}`
              : 'Awaiting source'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <output
            className={cn(
              'flex items-center gap-1.5 text-[11px]',
              connection.kind === 'connected'
                ? 'text-emerald-600 dark:text-emerald-300'
                : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                connection.kind === 'connected' ? 'bg-emerald-500' : 'bg-amber-500',
              )}
            />
            {connection.kind === 'connected'
              ? 'Watching file'
              : connection.kind === 'paused'
                ? 'Paused'
                : connection.kind === 'error'
                  ? 'Disconnected'
                  : 'Connecting'}
          </output>
          <Button size="sm" variant="outline" onClick={() => setPaused(!paused)}>
            {paused ? <Play /> : <Pause />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2 md:px-8">
        <Search size={14} className="text-muted-foreground" />
        <Input
          aria-label="Search events"
          placeholder="Search events…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-36 border-0 shadow-none sm:w-48"
        />
        <select
          aria-label="Event type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          <option value="all">All events</option>
          <option value="prompt">Prompts</option>
          <option value="reply">Replies</option>
          <option value="file">Tools & files</option>
          <option value="session_end">Session end</option>
          <option value="session_start">Session start</option>
        </select>
        <span className="text-[10px] text-muted-foreground">{events.length} events</span>
        {concept !== 'inspector' && (
          <Button
            size="sm"
            variant={follow ? 'secondary' : 'ghost'}
            className="ml-auto"
            onClick={() => setFollow(!follow)}
          >
            <ArrowDown /> {follow ? 'Following' : 'Follow tail'}
          </Button>
        )}
      </div>
      {connection.kind === 'error' && (
        <p role="alert" className="border-b bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {connection.message}
        </p>
      )}
      {snapshot && (snapshot.truncated || snapshot.skipped > 0) && (
        <p className="border-b bg-amber-500/10 px-5 py-2 text-[11px]">
          {snapshot.truncated ? 'Bounded tail: showing up to the latest 400 records / 1 MiB. ' : ''}
          {snapshot.skipped > 0
            ? `${snapshot.skipped} malformed or unsupported records skipped.`
            : ''}
        </p>
      )}
      <div
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 100 && follow)
            setFollow(false);
        }}
        className={cn(
          'min-h-0 flex-1 overflow-auto',
          concept === 'console' ? 'bg-[#111820] text-[#c3cfdc]' : 'bg-muted/20',
        )}
      >
        {!snapshot && (
          <p className="p-8 text-sm">
            {connection.kind === 'paused'
              ? 'Resume to load the log.'
              : 'Waiting for the first snapshot…'}
          </p>
        )}
        {snapshot && events.length === 0 && (
          <p className="p-8 text-sm">
            {snapshot.events.length === 0
              ? 'No complete supported records yet. New events appear after a full JSONL line is written.'
              : 'No events match these filters.'}
          </p>
        )}
        {concept === 'console' && <ConsoleView events={events} />}
        {concept === 'conversation' && <ConversationView events={events} />}
        {concept === 'inspector' && <InspectorView events={events} />}
        <div ref={tail} />
      </div>
      <footer className="flex flex-wrap justify-between gap-1 border-t px-5 py-2 text-[10px] text-muted-foreground">
        <span>Historical snapshot + live file appends · 1s watch interval</span>
        <span>Event stream, not token output · process status unknown</span>
      </footer>
    </>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Log lab root missing');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
