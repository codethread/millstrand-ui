import { useMemo } from 'react';
import { Network } from 'lucide-react';
import type { Card } from '../../shared/api';
import { useGraphSource } from '../hooks/use-graph';
import { layoutGraph, type GraphSource, type GraphLayout } from '../lib/graph';
import { useDashboardActions, useGraphRoot, useIssueFilter } from '../lib/navigation';
import { ErrorNotice, Loading } from './issue-parts';
import { GraphCanvas } from './graph-canvas';

export default function GraphView({ cards, allCards }: { cards: Card[]; allCards: Card[] }) {
  const root = useGraphRoot();
  const filter = useIssueFilter();
  const { setGraphRoot, openCard } = useDashboardActions();
  const source = useGraphSource(root, cards, allCards);
  const graph = source.kind === 'ready' ? source.graph : null;
  const layout = useMemo(
    () => (graph === null ? null : layoutGraph(graph, filter.includeClosed)),
    [graph, filter.includeClosed],
  );
  return (
    <div className="graph-workspace">
      <div className="graph-toolbar">
        <div>
          <Network className="size-4" />
          <strong>Relationships</strong>
          {layout?.kind === 'ready' && (
            <span>
              {layout.nodes.length} nodes · {layout.edges.length} connections
            </span>
          )}
        </div>
        <label>
          Focus
          <select
            aria-label="Graph focus"
            value={root ?? ''}
            onChange={(event) => setGraphRoot(event.target.value || null)}
          >
            <option value="">All filtered issues</option>
            {allCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.id} · {card.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <GraphSourceNotice source={source} />
      {layout?.kind === 'ready' ? (
        <GraphCanvas
          key={JSON.stringify([root, filter])}
          layout={layout}
          root={root}
          openCard={openCard}
        />
      ) : layout !== null ? (
        <GraphEmpty layout={layout} />
      ) : null}
    </div>
  );
}

export function GraphSourceNotice({ source }: { source: GraphSource }) {
  if (source.kind === 'loading')
    return <Loading text="Mapping this issue’s tasks and dependencies…" />;
  if (source.kind === 'unavailable') return <ErrorNotice error={source.error} />;
  if (source.error)
    return (
      <div>
        <ErrorNotice error={source.error} />
        <p className="px-4 text-xs text-muted-foreground">Showing last-known graph.</p>
      </div>
    );
  return null;
}

export function GraphEmpty({ layout }: { layout: Exclude<GraphLayout, { kind: 'ready' }> }) {
  return (
    <div className="empty-board">
      <Network />
      <h2>
        {layout.kind === 'too-large'
          ? `${layout.count} nodes is a lot to take in`
          : 'No relationships to show'}
      </h2>
      <p>
        {layout.kind === 'too-large'
          ? 'Narrow your filters or choose a focused issue. Graphs are limited to 150 nodes to stay readable.'
          : 'Choose an issue above or adjust the board filters.'}
      </p>
    </div>
  );
}
