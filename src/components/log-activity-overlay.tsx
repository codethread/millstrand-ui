import { Activity, ArrowDown, ListTree, MessageSquare, Pause, Play, Terminal } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { LogSource } from '../../shared/log-activity';
import { useLogStream } from '../hooks/use-session-log';
import { filterEvents } from '../lib/session-log';
import { useLogUiStore } from '../log-ui-store';
import { useWorkspacePreferenceStore } from '../workspace-preference-store';
import { workspaceIsHidden } from '../lib/workspaces';
import { cn } from '../lib/utils';
import { ConsoleView, ConversationView, InspectorView } from './session-log-views';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import '../session-log.css';

export function LogActivityOverlay() {
  const overlay = useLogUiStore((state) => state.overlay);
  const close = useLogUiStore((state) => state.close);
  const hidden = useWorkspacePreferenceStore(
    (state) => overlay.kind === 'open' && workspaceIsHidden(overlay.workspace, state.preferences),
  );
  useEffect(() => {
    if (hidden) close();
  }, [hidden, close]);
  if (overlay.kind === 'closed' || hidden) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="session-log flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none">
        <ExpandedLog
          key={`${overlay.source.provider}/${overlay.source.session}`}
          identity={overlay.identity}
          source={overlay.source}
        />
      </DialogContent>
    </Dialog>
  );
}
/** Single SSE owner while the expanded viewer is open; closing returns to the card unchanged. */
function ExpandedLog({ identity, source }: { identity: string; source: LogSource }) {
  const view = useLogUiStore((state) => state.view);
  const setView = useLogUiStore((state) => state.setView);
  const paused = useLogUiStore((state) => state.paused);
  const setPaused = useLogUiStore((state) => state.setPaused);
  const query = useLogUiStore((state) => state.query);
  const setQuery = useLogUiStore((state) => state.setQuery);
  const follow = useLogUiStore((state) => state.follow);
  const setFollow = useLogUiStore((state) => state.setFollow);
  const { snapshot, connection } = useLogStream(source.provider, source.session, paused);
  const events = filterEvents(snapshot?.events ?? [], query, 'all');
  const end = useRef<HTMLDivElement>(null);
  const latest = events.at(-1)?.id;
  useEffect(() => {
    if (latest && follow && view !== 'inspector') end.current?.scrollIntoView({ block: 'end' });
  }, [latest, follow, view]);
  return (
    <>
      <header className="border-b border-border px-5 py-5 pr-12 sm:px-8">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Activity className="size-3.5" />
          Session activity
        </div>
        <DialogTitle className="break-all text-xl">{identity}</DialogTitle>
        <DialogDescription className="mt-2 text-xs">
          {source.provider} · {source.session.slice(0, 8)} · Esc returns to your card or overview
        </DialogDescription>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-8">
        <Tabs
          value={view}
          onValueChange={(value) => {
            if (value === 'conversation' || value === 'inspector' || value === 'console')
              setView(value);
          }}
        >
          <TabsList aria-label="Log presentation">
            <TabsTrigger value="conversation" className="text-xs">
              <MessageSquare />
              Conversation
            </TabsTrigger>
            <TabsTrigger value="inspector" className="text-xs">
              <ListTree />
              Inspector
            </TabsTrigger>
            <TabsTrigger value="console" className="text-xs">
              <Terminal />
              Console
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3">
          <output
            className={cn(
              'text-[11px]',
              connection.kind === 'connected'
                ? 'text-emerald-600 dark:text-emerald-300'
                : 'text-muted-foreground',
            )}
          >
            {paused
              ? 'Paused'
              : connection.kind === 'connected'
                ? 'Watching file'
                : connection.kind === 'error'
                  ? 'Disconnected'
                  : 'Connecting…'}
          </output>
          <Button size="sm" variant="outline" onClick={() => setPaused(!paused)}>
            {paused ? <Play /> : <Pause />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3 border-b border-border px-5 py-2 sm:px-8">
        <Input
          aria-label="Search activity"
          placeholder="Search this session…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 max-w-xs text-xs"
        />
        <span className="whitespace-nowrap text-[10px] text-muted-foreground">
          {events.length} events
        </span>
        {view !== 'inspector' && (
          <Button
            size="sm"
            variant={follow ? 'secondary' : 'ghost'}
            className="ml-auto"
            onClick={() => setFollow(!follow)}
          >
            <ArrowDown />
            {follow ? 'Following' : 'Follow'}
          </Button>
        )}
      </div>
      {connection.kind === 'error' && (
        <p role="alert" className="bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {connection.message}
        </p>
      )}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto',
          view === 'console' ? 'bg-[#111820] text-[#c3cfdc]' : 'bg-muted/20',
        )}
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight > 100 && follow) setFollow(false);
        }}
      >
        {view === 'conversation' ? (
          <ConversationView events={events} />
        ) : view === 'inspector' ? (
          <InspectorView events={events} />
        ) : (
          <ConsoleView events={events} />
        )}
        {events.length === 0 && (
          <p className="p-8 text-sm text-muted-foreground">
            {snapshot ? 'No matching recorded events.' : 'Waiting for the session log…'}
          </p>
        )}
        <div ref={end} />
      </div>
      <footer className="flex flex-wrap justify-between gap-1 border-t border-border px-5 py-2 text-[10px] text-muted-foreground">
        <span>Read-only local session · not scoped to a single run or card</span>
        <span>
          {snapshot?.truncated ? 'Latest 400 records / 1 MiB · ' : ''}
          {snapshot?.skipped ? `${snapshot.skipped} records skipped · ` : ''}Recorded events, not
          token streaming
        </span>
      </footer>
    </>
  );
}
