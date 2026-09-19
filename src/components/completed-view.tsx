import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  Search,
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
  useIssueFilter,
} from '../lib/navigation';
import { DashboardFilters } from './dashboard-filters';
import { LabelPill } from './issue-parts';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

function CompletedSearchControls() {
  const query = useHistoryQuery();
  const actions = useDashboardActions();
  return (
    <div className="w-full min-w-0 md:max-w-xl">
      <label htmlFor="issue-search" className="mb-2 block text-xs font-medium">
        Search completed work
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
        <Input
          id="issue-search"
          className="h-10 bg-background pr-10 pl-10"
          type="search"
          placeholder="Title, ID, owner, branch or label…"
          value={query}
          onChange={(event) => actions.setHistoryQuery(event.target.value)}
        />
        {query && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-1 right-1"
            aria-label="Clear completed search"
            onClick={() => actions.setHistoryQuery('')}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

function CompletedFilterSummary() {
  const filter = useIssueFilter();
  const actions = useDashboardActions();
  const hasFilters =
    filter.types.length + filter.priorities.length + Object.keys(filter.terms).length > 0;
  if (!hasFilters) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active completed filters">
      {filter.types.map((type) => (
        <Button
          key={type}
          variant="secondary"
          size="sm"
          aria-label={`Remove type ${type}`}
          onClick={() => actions.toggleType(type)}
        >
          <span className="capitalize">{type}</span>
          <X />
        </Button>
      ))}
      {filter.priorities.map((priority) => (
        <Button
          key={priority}
          variant="secondary"
          size="sm"
          aria-label={`Remove priority ${priority}`}
          onClick={() => actions.togglePriority(priority)}
        >
          <span className="uppercase">{priority}</span>
          <X />
        </Button>
      ))}
      {Object.entries(filter.terms).map(([label, term]) => (
        <Button
          key={label}
          variant="secondary"
          size="sm"
          aria-label={`Remove label ${label}`}
          onClick={() => actions.toggleLabel(label)}
        >
          {term === 'exclude' ? '−' : '#'}
          {label}
          <X />
        </Button>
      ))}
      <Button variant="ghost" size="sm" onClick={actions.resetFilters}>
        Clear filters
      </Button>
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
          ? 'Try another date, clear your search, or adjust the filters.'
          : 'Try a different search or clear the filters. Only cards closed with a done outcome appear here.'}
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
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
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
        Day totals follow your search and filters. Epics and features are counted separately; tasks
        are not included.
      </p>
    </div>
  );
}

export function CompletedView() {
  const layout = useHistoryLayout();
  const selectedDay = useHistoryDay();
  const query = useHistoryQuery();
  const actions = useDashboardActions();
  const filter = useIssueFilter();
  const history = useCompletedHistory(query, filter);
  const health = useBoardStatus();
  const entries = history.data ?? [];
  const today = historyDateKey(new Date());
  const day = selectedDay ?? shiftHistoryDay(today, -1);
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-7">
      <div className="w-full space-y-6">
        <div className="pr-8">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            Completed work
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Look back at what got done.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse recent completions or revisit a day. Pick a card to see the details.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <Clock3 className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong className="font-medium text-foreground">Completion date estimate.</strong> Exact
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
            if (value === 'timeline' || value === 'recap') actions.setHistoryLayout(value);
          }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <TabsList aria-label="Completed work layouts" className="h-10">
              <TabsTrigger value="timeline">
                <List />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="recap">
                <CalendarDays />
                Day recap
              </TabsTrigger>
            </TabsList>
            <div className="flex w-full min-w-0 items-end gap-2 md:max-w-xl">
              <CompletedSearchControls />
              <div className="pb-1">
                <DashboardFilters />
              </div>
            </div>
          </div>
          <CompletedFilterSummary />
          <output className="mt-2 block text-xs text-muted-foreground">
            {entries.length} matching done cards across all days · newest first
          </output>
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
        </Tabs>
      </div>
    </div>
  );
}
