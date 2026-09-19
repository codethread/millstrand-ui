import {
  ArrowDown,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { useBoardStatus, useCompletedHistory } from '../hooks/use-cards';
import {
  completedDays,
  completedRecap,
  historyDateKey,
  historyDayLabel,
  shiftHistoryDay,
  type CompletedEntry,
} from '../lib/board';
import {
  useDashboardActions,
  useHistoryDay,
  useHistoryLayout,
  useHistoryQuery,
} from '../lib/navigation';
import { LabelPill } from './issue-parts';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

export function CompletedSearchControls() {
  const query = useHistoryQuery();
  const actions = useDashboardActions();
  return (
    <div className="search-field ml-auto">
      <Search />
      <Input
        id="issue-search"
        aria-label="Search completed work"
        placeholder="Search completed work…"
        value={query}
        onChange={(event) => actions.setHistoryQuery(event.target.value)}
      />
      {query && (
        <button aria-label="Clear completed search" onClick={() => actions.setHistoryQuery('')}>
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

function EntryLink({ entry }: { entry: CompletedEntry }) {
  const actions = useDashboardActions();
  return (
    <button
      className="group flex w-full min-w-0 items-start gap-3 text-left"
      onClick={() => actions.openCard(entry.card.id)}
    >
      <span className="mt-0.5 rounded-full bg-primary/10 p-1 text-primary">
        <Check className="size-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block leading-relaxed font-medium break-words group-hover:text-primary">
          {entry.card.title}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {entry.card.id} · {entry.card.type}
          {entry.parent && ` · ${entry.parent.title}`}
        </span>
      </span>
      <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function EmptyHistory({ daily = false }: { daily?: boolean }) {
  return (
    <div className="rounded-xl border border-border border-dashed p-10 text-center">
      <CalendarDays className="mx-auto mb-3 size-6 text-muted-foreground" />
      <h3 className="font-medium">
        {daily ? 'Nothing recorded for this day' : 'No completed work found'}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {daily
          ? 'Try the previous day, another date, or the timeline.'
          : 'Try a different search. Only cards closed with a done outcome appear here.'}
      </p>
    </div>
  );
}

function Timeline({ entries }: { entries: CompletedEntry[] }) {
  const actions = useDashboardActions();
  if (entries.length === 0) return <EmptyHistory />;
  return (
    <div className="space-y-8">
      {completedDays(entries).map((group) => (
        <section
          key={group.day ?? 'unknown'}
          className="grid gap-3 lg:grid-cols-[185px_minmax(0,1fr)]"
        >
          <div className="pt-2">
            <h3 className="text-sm font-semibold">
              {group.day === null ? 'Date unavailable' : historyDayLabel(group.day)}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {group.entries.length} completed {group.entries.length === 1 ? 'card' : 'cards'}
            </p>
            {group.day && (
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-auto p-0"
                onClick={() => {
                  actions.openHistoryRecap(group.day);
                }}
              >
                Open day recap <ArrowUpRight />
              </Button>
            )}
          </div>
          <div className="space-y-3 border-l-2 border-primary/20 pl-5">
            {group.entries.map((entry) => (
              <article
                key={entry.card.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <EntryLink entry={entry} />
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-9 text-xs text-muted-foreground">
                  <span>
                    {entry.updatedAt === null
                      ? 'Time unavailable'
                      : new Date(entry.updatedAt).toLocaleTimeString('en', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                  </span>
                  {entry.card.labels.map((label) => (
                    <LabelPill key={label} label={label} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DailyRecap({
  entries,
  day,
  today,
}: {
  entries: CompletedEntry[];
  day: string;
  today: string;
}) {
  const actions = useDashboardActions();
  const { entries: daily, features, epics, owners } = completedRecap(entries, day);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous day"
          onClick={() => actions.setHistoryDay(shiftHistoryDay(day, -1))}
        >
          <ChevronLeft />
        </Button>
        <Input
          className="w-auto"
          type="date"
          aria-label="Recap date"
          value={day}
          onChange={(event) => {
            if (event.target.value) actions.setHistoryDay(event.target.value);
          }}
        />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next day"
          onClick={() => actions.setHistoryDay(shiftHistoryDay(day, 1))}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => actions.setHistoryDay(shiftHistoryDay(today, -1))}
        >
          Yesterday
        </Button>
        <Button variant="ghost" size="sm" onClick={() => actions.setHistoryDay(today)}>
          Today
        </Button>
      </div>
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-8">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">
          The daily wrap
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight">{historyDayLabel(day)}</h3>
        <p className="mt-2 text-muted-foreground">A little space to see what moved forward.</p>
        <div className="mt-7 grid grid-cols-3 gap-3 border-t border-primary/15 pt-5">
          {[
            { count: features, label: 'Features' },
            { count: epics, label: 'Epics' },
            { count: owners, label: 'Owners' },
          ].map(({ count, label }) => (
            <div key={label}>
              <p className="text-3xl font-semibold text-primary">{count}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>
      {daily.length === 0 ? (
        <EmptyHistory daily />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {daily.map((entry) => (
            <article key={entry.card.id} className="rounded-xl border border-border bg-card p-5">
              <EntryLink entry={entry} />
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="mr-auto break-all">{entry.card.owner ?? 'No owner recorded'}</span>
                {entry.card.labels.map((label) => (
                  <LabelPill key={label} label={label} />
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Day totals follow your search. Epics and features are counted separately; tasks are not
        included.
      </p>
    </div>
  );
}

function HistoryLedger({ entries }: { entries: CompletedEntry[] }) {
  if (entries.length === 0) return <EmptyHistory />;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[650px] text-left text-sm">
        <caption className="sr-only">Completed cards, newest last update first</caption>
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="p-4">
              <span className="inline-flex items-center gap-1">
                Last updated <ArrowDown className="size-3" />
              </span>
            </th>
            <th scope="col" className="p-4">
              Completed work
            </th>
            <th scope="col" className="p-4">
              Owner
            </th>
            <th scope="col" className="p-4">
              Labels
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.card.id} className="border-t border-border align-top hover:bg-muted/30">
              <td className="w-36 p-4 text-xs whitespace-nowrap text-muted-foreground">
                {entry.updatedAt === null
                  ? 'Unknown date'
                  : new Date(entry.updatedAt).toLocaleDateString('en', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
              </td>
              <td className="min-w-72 p-4">
                <EntryLink entry={entry} />
              </td>
              <td className="max-w-44 p-4 text-xs break-words text-muted-foreground">
                {entry.card.owner ?? '—'}
              </td>
              <td className="p-4">
                <div className="flex flex-wrap gap-1">
                  {entry.card.labels.map((label) => (
                    <LabelPill key={label} label={label} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompletedView() {
  const layout = useHistoryLayout();
  const selectedDay = useHistoryDay();
  const query = useHistoryQuery();
  const actions = useDashboardActions();
  const history = useCompletedHistory(query);
  const health = useBoardStatus();
  const entries = history.data ?? [];
  const today = historyDateKey(new Date());
  const day = selectedDay ?? shiftHistoryDay(today, -1);
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-7">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="pr-8">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            Completed / Design lab
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Look back at what got done.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Three ways to explore the same work. Pick a card to see the details.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <Clock3 className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong className="font-medium text-foreground">Prototype date estimate.</strong> Exact
            completion dates aren’t recorded. These views use each done card’s last update, which
            can change after completion. Dates are in your local timezone. Abandoned, unactioned and
            unknown outcomes are excluded.
            {health.error && (
              <strong className="block text-destructive">
                Refresh failed — showing last-known work.
              </strong>
            )}
          </p>
        </div>
        <Tabs
          value={layout}
          onValueChange={(value) => {
            if (value === 'timeline' || value === 'recap' || value === 'ledger')
              actions.setHistoryLayout(value);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList aria-label="Completed work prototypes" className="h-auto flex-wrap">
              <TabsTrigger value="timeline">
                <List />
                1. Timeline
              </TabsTrigger>
              <TabsTrigger value="recap">
                <CalendarDays />
                2. Day recap
              </TabsTrigger>
              <TabsTrigger value="ledger">
                <Table2 />
                3. Ledger
              </TabsTrigger>
            </TabsList>
            <span className="text-xs text-muted-foreground">
              {entries.length} done cards · newest first
            </span>
          </div>
          <TabsContent value="timeline" className="mt-5">
            <p className="mb-5 text-sm text-muted-foreground">
              A running history, grouped by day. Best for catching up after time away.
            </p>
            <Timeline entries={entries} />
          </TabsContent>
          <TabsContent value="recap" className="mt-5">
            <p className="mb-5 text-sm text-muted-foreground">
              “What did we do yesterday?” One day, one focused recap.
            </p>
            <DailyRecap entries={entries} day={day} today={today} />
          </TabsContent>
          <TabsContent value="ledger" className="mt-5">
            <p className="mb-5 text-sm text-muted-foreground">
              A compact archive. Best for scanning titles, owners and labels across days.
            </p>
            <HistoryLedger entries={entries} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
