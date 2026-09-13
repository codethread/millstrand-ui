import { ArrowUpRight, Inbox, Layers } from 'lucide-react';
import type { Card } from '../../shared/api';
import { lanes, selectOutline } from '../lib/board';
import { useDashboardNavigation } from '../lib/navigation';
import { IssueAgents } from './agents-view';
import { LabelPill, StatusBadge, StatusIcon, TypeIcon } from './issue-parts';
import { Button } from './ui/button';

function IssueCard({ card, allCards }: { card: Card; allCards: Card[] }) {
  const { openCard } = useDashboardNavigation();
  const epic = allCards.find((parent) => parent.id === card.epicId);
  return (
    <article className="issue-card group">
      <button
        className="flex w-full flex-col gap-[13px] text-left"
        onClick={() => openCard(card.id)}
        aria-label={`Open ${card.title}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <TypeIcon type={card.type} />
            <span className="issue-id">{card.id}</span>
          </span>
          <span
            className={`priority priority-${card.priority}`}
            title={`Priority ${card.priority.toUpperCase()}`}
          >
            <span>▰</span> {card.priority.toUpperCase()}
          </span>
        </div>
        <h3>{card.title}</h3>
        {epic && (
          <div className="card-epic">
            <Layers className="size-3" />
            <span>{epic.title}</span>
          </div>
        )}
        {card.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {card.labels.map((label) => (
              <LabelPill key={label} label={label} />
            ))}
          </div>
        )}
        <ArrowUpRight className="card-open-icon" />
      </button>
      <div className="card-footer flex-col! items-stretch!">
        <IssueAgents owner={card.owner} target={card.id} />
      </div>
    </article>
  );
}

export function BoardView({ cards, allCards }: { cards: Card[]; allCards: Card[] }) {
  const includeClosed = useDashboardNavigation().filter.includeClosed;
  const columns = lanes.filter((lane) =>
    lane.id === 'unknown'
      ? cards.some((card) => card.lane === 'unknown')
      : lane.id !== 'closed' || includeClosed,
  );
  return (
    <div className="board-canvas">
      <div className="board-columns">
        {columns.map((lane) => {
          const items = cards.filter((card) => card.lane === lane.id);
          return (
            <section
              className={`board-column lane-${lane.id}`}
              key={lane.id}
              aria-label={lane.title}
            >
              <div className="column-heading">
                <StatusIcon status={lane.id} />
                <h2>{lane.title}</h2>
                <span className="column-count">{items.length}</span>
              </div>
              <p className="column-description">{lane.description}</p>
              <div className="column-cards">
                {items.map((card) => (
                  <IssueCard key={card.id} card={card} allCards={allCards} />
                ))}
                {items.length === 0 && (
                  <div className="empty-lane">
                    <span className="empty-lane-mark" />
                    <span>No issues here</span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function OutlineView({ cards, allCards }: { cards: Card[]; allCards: Card[] }) {
  const { openCard, exploreGraph } = useDashboardNavigation();
  const groups = selectOutline(allCards, cards);
  return (
    <div className="outline-canvas">
      {groups.map((group) => (
        <section key={group.parent?.id ?? 'standalone'} className="outline-group">
          <div className="outline-group-heading">
            <Layers className="size-4 text-violet-500" />
            {group.parent ? (
              <button onClick={() => openCard(group.parent!.id)}>{group.parent.title}</button>
            ) : (
              <h2>Standalone work</h2>
            )}
            <span className="column-count">{group.cards.length}</span>
            {group.context && <span className="text-xs text-muted-foreground">Parent context</span>}
            {group.parent && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => exploreGraph(group.parent!.id)}
              >
                Explore graph <ArrowUpRight />
              </Button>
            )}
          </div>
          {group.cards.map((card) => (
            <div
              className="flex flex-wrap items-center border-b border-border pr-3 last:border-b-0"
              key={card.id}
            >
              <button className="outline-row flex-1 border-b-0!" onClick={() => openCard(card.id)}>
                <StatusIcon status={card.lane} />
                <span className="issue-id">{card.id}</span>
                <span className="outline-title">{card.title}</span>
                <div className="outline-labels">
                  {card.labels.map((label) => (
                    <LabelPill label={label} key={label} />
                  ))}
                </div>
                <StatusBadge status={card.lane} />
                <span className={`priority priority-${card.priority}`}>
                  {card.priority.toUpperCase()}
                </span>
              </button>
              <div className="min-w-0 max-w-full px-3 pb-2">
                <IssueAgents owner={card.owner} target={card.id} />
              </div>
            </div>
          ))}
          {group.cards.length === 0 && (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              No matching features in this epic.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

export function EmptyBoard() {
  const reset = useDashboardNavigation().resetFilters;
  return (
    <div className="empty-board">
      <div className="empty-board-icon">
        <Inbox />
      </div>
      <h2>No issues match this view</h2>
      <p>Try a different search or give your filters a little more room.</p>
      <Button variant="outline" onClick={reset}>
        Clear filters
      </Button>
    </div>
  );
}
