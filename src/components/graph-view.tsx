import { useMemo } from 'react';
import { Network } from 'lucide-react';
import type { Card } from '../../shared/api';
import { useDependencies, useGraphSource } from '../hooks/use-graph';
import {
  dependencyLayout,
  graphFocusCard,
  graphHierarchyRoot,
  type GraphSource,
  type GraphLayout,
} from '../lib/graph';
import {
  useDashboardActions,
  useGraphDependencies,
  useGraphRoot,
  useIssueFilter,
} from '../lib/navigation';
import { ErrorNotice, Loading } from './issue-parts';
import { GraphCanvas } from './graph-canvas';
import { Button } from './ui/button';

export default function GraphView({ cards, allCards }: { cards: Card[]; allCards: Card[] }) {
  const root = useGraphRoot();
  const filter = useIssueFilter();
  const selection = useGraphDependencies();
  const dependencies = useDependencies();
  const dependencyGraph = dependencies.data ?? null;
  const {
    setGraphRoot,
    openCard,
    setGraphDependencies,
    toggleGraphDependencies,
    showAllGraphCards,
  } = useDashboardActions();
  const source = useGraphSource(root, cards, allCards);
  const graph = source.kind === 'ready' ? source.graph : null;
  const layout = useMemo(
    () =>
      graph === null
        ? null
        : dependencyLayout(graph, dependencyGraph, selection, filter.includeClosed),
    [graph, dependencyGraph, selection, filter.includeClosed],
  );
  const focusTargets = useMemo(
    () =>
      graph === null || layout?.kind !== 'ready'
        ? {}
        : Object.fromEntries(
            layout.nodes
              .map((node) => node.data.item)
              .flatMap((node) => {
                const target = graphFocusCard(node.id, graph, allCards);
                return target === null ? [] : [[node.id, target]];
              }),
          ),
    [graph, layout, allCards],
  );
  return (
    <div className="graph-workspace">
      <div className="graph-toolbar flex-wrap">
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
          Focus card
          <select
            aria-label="Graph focus"
            value={root ?? ''}
            onChange={(event) => setGraphRoot(event.target.value || null)}
          >
            <option value="">All filtered cards</option>
            {allCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.id} · {card.title}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={showAllGraphCards}
          title="Clear hierarchy focus, dependencies and filters; completed visibility stays unchanged"
        >
          Show all cards
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>Dependencies</span>
        <Button
          size="sm"
          variant={selection.kind === 'expand' ? 'secondary' : 'ghost'}
          onClick={() =>
            setGraphDependencies({
              kind: 'expand',
              ids: selection.kind === 'expand' ? selection.ids : selection.id ? [selection.id] : [],
            })
          }
        >
          Add / hide in place
        </Button>
        <Button
          size="sm"
          variant={selection.kind === 'focus' ? 'secondary' : 'ghost'}
          onClick={() =>
            setGraphDependencies({
              kind: 'focus',
              id: selection.kind === 'expand' ? (selection.ids[0] ?? null) : selection.id,
            })
          }
        >
          Dependencies only
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setGraphDependencies(
              selection.kind === 'expand'
                ? { kind: 'expand', ids: [] }
                : { kind: 'focus', id: null },
            )
          }
        >
          Reset dependencies
        </Button>
        <span>
          {selection.kind === 'expand'
            ? `${selection.ids.length} expanded`
            : selection.id
              ? `Focused on ${selection.id}`
              : 'Choose a card’s dependency menu'}
        </span>
        <span>Solid: hierarchy · Dashed: added card · Counts include closed cards</span>
      </div>
      {selection.kind === 'expand' && selection.ids.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {selection.ids.map((id) => (
            <Button
              key={id}
              size="sm"
              variant="outline"
              onClick={() => toggleGraphDependencies(id)}
              aria-label={`Hide dependencies for ${id}`}
            >
              {id} ×
            </Button>
          ))}
        </div>
      )}
      <GraphSourceNotice source={source} />
      {dependencies.isPending && (
        <p className="px-4 py-2 text-xs text-muted-foreground">
          Loading dependency counts and relationships…
        </p>
      )}
      {dependencies.error && (
        <div>
          <ErrorNotice error={dependencies.error} />
          <p className="px-4 text-xs text-muted-foreground">
            {dependencyGraph
              ? 'Showing last-known dependencies and counts.'
              : 'Dependency counts and expansion are unavailable.'}
          </p>
        </div>
      )}

      {layout?.kind === 'ready' ? (
        <GraphCanvas
          key={JSON.stringify([root, filter, selection])}
          layout={layout}
          root={graphHierarchyRoot(root, allCards)}
          openCard={openCard}
          dependencyMode={selection.kind}
          promptIds={graph?.nodes.map((node) => node.id) ?? []}
          toggleDependencies={toggleGraphDependencies}
          focusTargets={focusTargets}
          focusHierarchy={setGraphRoot}
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
