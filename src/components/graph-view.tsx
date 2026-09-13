import { useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
} from '@xyflow/react';
import { ArrowUpRight, Network, X } from 'lucide-react';
import type { Card, GraphNode } from '../../shared/api';
import { useGraph } from '../lib/api';
import { graphBody, graphFromCards, layoutGraph, type IssueGraphNode } from '../lib/graph';
import { useDashboardNavigation } from '../lib/navigation';
import { useDashboardStore } from '../store';
import { Button } from './ui/button';
import { ErrorNotice, Loading } from './issue-parts';
import { Markdown } from './issue-detail';
import '@xyflow/react/dist/style.css';

function GraphCard({ data }: NodeProps<IssueGraphNode>) {
  return (
    <div className={`graph-node graph-kind-${data.item.kind}`}>
      <Handle type="target" position={Position.Left} />
      <div className="graph-node-header">
        <span className={`graph-kind-label kind-${data.item.kind}`}>{data.item.kind}</span>
        <span className="issue-id">{data.item.id}</span>
        <span className={`graph-status-dot status-${data.status}`} title={data.status} />
      </div>
      <strong>{data.item.title}</strong>
      <div className="graph-node-footer">
        <span className={`status-${data.status}`}>
          {data.status === 'closed' ? 'Completed' : data.status.replaceAll('_', ' ')}
        </span>
        <ArrowUpRight className="size-3" />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { issue: GraphCard };

export default function GraphView({ cards, allCards }: { cards: Card[]; allCards: Card[] }) {
  const root = useDashboardStore((s) => s.graphRoot);
  const includeClosed = useDashboardStore((s) => s.filter.includeClosed);
  const setRoot = useDashboardStore((s) => s.setGraphRoot);
  const { openCard } = useDashboardNavigation();
  const query = useGraph(root);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graph = useMemo(
    () => (root === null ? graphFromCards(cards, allCards) : (query.data ?? null)),
    [root, cards, allCards, query.data],
  );
  const result = useMemo(
    () => (graph ? layoutGraph(graph, includeClosed) : null),
    [graph, includeClosed],
  );
  const layout = result?.kind === 'ready' ? result : { nodes: [], edges: [] };
  const selected = layout.nodes.find((node) => node.id === selectedId)?.data.item ?? null;
  function selectNode(item: GraphNode) {
    if (item.kind === 'epic' || item.kind === 'feature') openCard(item.id);
    else setSelectedId(item.id);
  }
  return (
    <div className="graph-workspace">
      <div className="graph-toolbar">
        <div>
          <Network className="size-4" />
          <strong>Relationships</strong>
          <span>
            {layout.nodes.length} nodes · {layout.edges.length} connections
          </span>
        </div>
        <label>
          Focus
          <select
            aria-label="Graph focus"
            value={root ?? ''}
            onChange={(event) => {
              setRoot(event.target.value || null);
              setSelectedId(null);
            }}
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
      {query.error && <ErrorNotice error={query.error} />}
      {root !== null && query.isPending ? (
        <Loading text="Mapping this issue’s tasks and dependencies…" />
      ) : layout.nodes.length === 0 ? (
        <div className="empty-board">
          <Network />
          <h2>
            {result?.kind === 'too-large'
              ? `${result.count} nodes is a lot to take in`
              : 'No relationships to show'}
          </h2>
          <p>
            {result?.kind === 'too-large'
              ? 'Narrow your filters or choose a focused issue. Graphs are limited to 150 nodes to stay readable.'
              : 'Choose an issue above or adjust the board filters.'}
          </p>
        </div>
      ) : (
        <div className="graph-canvas">
          <ReactFlow
            key={`${root ?? 'all'}-${includeClosed}-${layout.nodes.map((node) => node.id).join(',')}`}
            nodes={layout.nodes}
            edges={layout.edges}
            nodeTypes={nodeTypes}
            colorMode="system"
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.15}
            maxZoom={1.6}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_event, node) => selectNode(node.data.item)}
            onPaneClick={() => setSelectedId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--graph-dots)"
            />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor="#b4bac7" maskColor="var(--graph-canvas)" />
          </ReactFlow>
          <div className="graph-legend">
            <span>
              <i />
              Parent → child
            </span>
            <span>
              <i className="dependency" />
              Depends on → prerequisite
            </span>
          </div>
          <div className="graph-help">Scroll to zoom · drag to pan · click to inspect</div>
          {selected && (
            <aside className="graph-inspector">
              <div className="flex items-center justify-between">
                <span className="issue-id">
                  {selected.kind} / {selected.id}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close graph inspector"
                >
                  <X />
                </Button>
              </div>
              <h3>{selected.title}</h3>
              <span className="text-xs text-muted-foreground">{selected.state}</span>
              {graphBody(selected.attributes) && <Markdown text={graphBody(selected.attributes)} />}
              <details>
                <summary>Attributes</summary>
                <pre className="raw-attributes">{JSON.stringify(selected.attributes, null, 2)}</pre>
              </details>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
