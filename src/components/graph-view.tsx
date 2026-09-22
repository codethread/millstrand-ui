import { useMemo } from 'react';
import { Network } from 'lucide-react';
import type { Card } from '../../shared/api';
import { useDependencies, useGraphSource } from '../hooks/use-graph';
import {
  dependencyLayout,
  graphFocusTargets,
  type GraphSource,
  type GraphLayout,
} from '../lib/graph';
import {
  useDashboardActions,
  useGraphDependencies,
  useGraphRoot,
  useGraphShowTasks,
  useIssueFilter,
} from '../lib/navigation';
import { ErrorNotice, Loading } from './issue-parts';
import { GraphCanvas } from './graph-canvas';
import { Button } from './ui/button';

export default function GraphView({ cards, allCards }: { cards: Card[]; allCards: Card[] }) {
  const root = useGraphRoot();
  const filter = useIssueFilter();
  const showTasks = useGraphShowTasks();
  const expanded = useGraphDependencies();
  const dependencies = useDependencies(expanded.length > 0);
  const dependencyGraph = expanded.length > 0 ? (dependencies.data ?? null) : null;
  const {
    setGraphRoot,
    toggleGraphTasks,
    openCard,
    clearGraphDependencies,
    toggleGraphDependencies,
    showAllGraphCards,
  } = useDashboardActions();
  const source = useGraphSource(root, cards, allCards);
  const graph = source.kind === 'ready' ? source.graph : null;
  const layout = useMemo(
    () =>
      graph === null
        ? null
        : dependencyLayout(graph, dependencyGraph, expanded, {
            includeClosed: filter.includeClosed,
            showTasks,
          }),
    [graph, dependencyGraph, expanded, filter.includeClosed, showTasks],
  );
  const focusTargets = useMemo(
    () => (graph === null ? new Map<string, string>() : graphFocusTargets(graph, allCards)),
    [graph, allCards],
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
        <Button
          size="sm"
          variant={showTasks ? 'secondary' : 'outline'}
          aria-pressed={showTasks}
          onClick={toggleGraphTasks}
        >
          Show tasks
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={expanded.length === 0}
          onClick={clearGraphDependencies}
        >
          Reset dependencies
        </Button>
        <span>{expanded.length} expanded</span>
        <span>Solid: hierarchy · Dashed: added card · Counts include hidden work</span>
      </div>
      {expanded.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {expanded.map((id) => (
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
      {expanded.length > 0 && dependencies.isPending && (
        <p className="px-4 py-2 text-xs text-muted-foreground">
          Loading direct dependency relationships…
        </p>
      )}
      {expanded.length > 0 && dependencies.error && (
        <div>
          <ErrorNotice error={dependencies.error} />
          <p className="px-4 text-xs text-muted-foreground">
            {dependencyGraph
              ? 'Showing last-known dependency relationships.'
              : 'Dependency expansion is unavailable.'}
          </p>
        </div>
      )}

      {layout?.kind === 'ready' ? (
        <GraphCanvas
          // Fit the first lazy expansion when its snapshot arrives, not just the old hierarchy.
          key={JSON.stringify([root, filter, showTasks, dependencyGraph === null ? [] : expanded])}
          layout={layout}
          openCard={openCard}
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
