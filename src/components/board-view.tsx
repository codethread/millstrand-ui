import { Inbox, Layers } from 'lucide-react';
import type { Card } from '../../shared/api';
import type { BoardColumn, BoardSwimlane, OutlineGroup } from '../lib/board';
import { labelColor } from '../lib/board';
import { useDashboardActions, useIssueFilter } from '../lib/navigation';
import { cn } from '../lib/utils';
import { CardDependencyCounts } from './dependency-counts';
import { CardSignals } from './card-signals';
import { ExternalRefs } from './external-refs';
import { LinkedCardBadge } from './linked-card';
import { StatusBadge, StatusIcon, TypeIcon } from './issue-parts';
import { Button } from './ui/button';
import { CardContextMenu, CardMenuButton } from './card-actions';

function BoardLabels({ labels }: { labels: string[] }) {
  const { toggleLabel } = useDashboardActions();
  const filter = useIssueFilter();
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          aria-label={`Filter by label ${label}`}
          aria-pressed={filter.terms[label] === 'include'}
          onClick={() => toggleLabel(label)}
          className={cn(
            'max-w-full rounded border border-transparent px-1.5 py-0.5 text-left text-[11px] leading-4 [overflow-wrap:anywhere] hover:border-current aria-pressed:border-current max-sm:min-h-8',
            `label-${labelColor(label)}`,
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function CardTitle({ card }: { card: Card }) {
  const { openCard, openLinkedCard } = useDashboardActions();
  const link = card.link;
  // A live mirror opens the authoritative card; an unavailable one opens its honest local notice.
  const downstream = link?.status === 'live' ? link.target : null;
  return (
    <button
      className="flex min-h-7 w-full items-baseline gap-2 text-left text-[13px] leading-snug font-medium hover:text-primary"
      onClick={() => (downstream === null ? openCard(card.id) : openLinkedCard(downstream))}
      aria-label={
        downstream === null
          ? `Open ${card.title}`
          : `Open ${card.title} on ${downstream.workspaceName}`
      }
    >
      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-normal text-muted-foreground">
        <TypeIcon type={card.type} />
        {card.id}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{card.title}</span>
    </button>
  );
}

function CardMetadata({ card, outline }: { card: Card; outline: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      {outline && <StatusBadge status={card.lane} />}
      {card.link !== null && <LinkedCardBadge link={card.link} />}
      <CardSignals card={card} />
      <ExternalRefs refs={card.externalRefs} />
      <span className={`priority priority-${card.priority}`}>
        <span className="sr-only">Priority </span>
        {card.priority.toUpperCase()}
      </span>
      <div className="ml-auto flex items-center">
        <CardDependencyCounts counts={card.dependencies} />
        <CardMenuButton card={card} />
      </div>
    </div>
  );
}

function IssueCard({ card, outline = false }: { card: Card; outline?: boolean }) {
  return (
    <CardContextMenu card={card}>
      <article
        data-card={card.id}
        data-linked={card.link?.status}
        className={cn(
          'min-w-0 bg-card hover:bg-accent/20',
          outline
            ? 'grid items-center gap-x-4 gap-y-1 border-b border-border px-3 py-2 last:border-b-0 @3xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]'
            : 'rounded-lg border border-border p-3',
          // Linked mirrors carry a destination accent after the base border classes.
          card.link?.status === 'live' && 'border-l-4 border-l-primary/50',
          card.link?.status === 'unavailable' && 'border-l-4 border-l-amber-500/70',
        )}
      >
        <div className="min-w-0 space-y-1">
          <h3>
            <CardTitle card={card} />
          </h3>
          {card.labels.length > 0 && <BoardLabels labels={card.labels} />}
        </div>
        <div className={cn(!outline && 'mt-2')}>
          <CardMetadata card={card} outline={outline} />
        </div>
      </article>
    </CardContextMenu>
  );
}

const canvasClass =
  '@container flex-1 min-h-0 overflow-auto border-t border-border bg-muted/30 px-3 pb-6 pt-12 sm:px-5';

export function BoardView({
  columns,
  swimlanes,
}: {
  columns: BoardColumn[];
  swimlanes: BoardSwimlane[];
}) {
  const gridStyle = { gridTemplateColumns: `repeat(${columns.length}, minmax(230px, 1fr))` };
  return (
    <section
      className={cn(canvasClass, 'relative focus-visible:outline-primary')}
      aria-label="Board by epic, scroll to see more statuses"
      // Keyboard users need to focus the scroll region to pan across statuses.
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <div style={{ minWidth: columns.length * 230 + (columns.length - 1) * 12 }}>
        <div
          className="sticky top-0 z-1 grid gap-3 border-b border-border bg-background py-3 shadow-sm before:absolute before:inset-x-0 before:bottom-full before:h-12 before:bg-background"
          style={gridStyle}
          aria-label="Status columns"
        >
          {columns.map(({ lane, count }) => (
            <div key={lane.id} className="flex min-w-0 items-center gap-2 px-2">
              <StatusIcon status={lane.id} />
              <h2 className="text-xs font-semibold">{lane.title}</h2>
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {count}
                <span className="sr-only"> matching features</span>
              </span>
            </div>
          ))}
        </div>
        {swimlanes.map((group) => (
          <section
            key={group.parent?.id ?? 'standalone'}
            aria-label={group.parent?.title ?? 'Standalone work'}
            className="border-b border-border pb-4 last:border-b-0"
          >
            <div className="sticky left-0 my-3 w-[100cqw] max-w-full rounded-lg border border-border bg-card">
              {group.parent ? (
                <EpicHeading
                  card={group.parent}
                  count={group.cards.length}
                  context={group.context}
                />
              ) : (
                <h2 className="flex items-center gap-2 px-3 py-2 text-xs font-semibold">
                  <Layers className="size-4 text-primary" />
                  Standalone work
                  <span className="font-normal text-muted-foreground">{group.cards.length}</span>
                </h2>
              )}
            </div>
            {group.cards.length === 0 ? (
              <p className="sticky left-0 w-fit px-3 py-3 text-sm text-muted-foreground">
                No matching features in this epic.
              </p>
            ) : (
              <div className="grid items-start gap-3" style={gridStyle}>
                {group.columns.map(({ lane, cards }) => (
                  <section key={lane.id} aria-label={lane.title} className="min-w-0 space-y-2">
                    {cards.map((card) => (
                      <IssueCard key={card.id} card={card} />
                    ))}
                  </section>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function EpicHeading({ card, count, context }: { card: Card; count: number; context: boolean }) {
  return (
    <CardContextMenu card={card}>
      <div className="grid items-center gap-x-4 gap-y-1 border-b border-border bg-accent/40 px-3 py-2 @3xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="min-w-0 space-y-1">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1">
              <CardTitle card={card} />
            </h2>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {count}
              <span className="sr-only"> matching features</span>
            </span>
          </div>
          {context && (
            <p className="text-xs text-muted-foreground">
              Parent context · outside current filters
            </p>
          )}
          {card.labels.length > 0 && <BoardLabels labels={card.labels} />}
        </div>
        <CardMetadata card={card} outline />
      </div>
    </CardContextMenu>
  );
}

export function OutlineView({ groups }: { groups: OutlineGroup[] }) {
  return (
    <div className={cn(canvasClass, 'space-y-4')}>
      {groups.map((group) => (
        <section
          key={group.parent?.id ?? 'standalone'}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          {group.parent ? (
            <EpicHeading card={group.parent} count={group.cards.length} context={group.context} />
          ) : (
            <h2 className="flex items-center gap-2 border-b border-border bg-accent/40 px-3 py-3 text-xs font-semibold">
              <Layers className="size-4 text-primary" />
              Standalone work
              <span className="font-normal text-muted-foreground">{group.cards.length}</span>
            </h2>
          )}
          {group.cards.map((card) => (
            <IssueCard key={card.id} card={card} outline />
          ))}
          {group.cards.length === 0 && (
            <p className="px-3 py-5 text-sm text-muted-foreground">
              No matching features in this epic.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

export function EmptyBoard() {
  const { resetFilters } = useDashboardActions();
  return (
    <div className="empty-board">
      <div className="empty-board-icon">
        <Inbox />
      </div>
      <h2>No issues match this view</h2>
      <p>Try a different search or give your filters a little more room.</p>
      <Button variant="outline" onClick={resetFilters}>
        Clear filters
      </Button>
    </div>
  );
}
