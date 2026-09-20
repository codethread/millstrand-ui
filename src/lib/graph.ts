import { graphlib, layout as runLayout } from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Card, CardGraph, GraphNode, JsonValue } from '../../shared/api';

export type IssueGraphNode = Node<{ item: GraphNode; status: string }, 'issue'>;

export function graphFromCards(cards: Card[], allCards: Card[]): CardGraph {
  const ids = new Set(cards.map((card) => card.id));
  for (const card of cards) if (card.epicId) ids.add(card.epicId);
  const included = allCards.filter((card) => ids.has(card.id));
  return {
    rootId: '',
    nodes: included.map((card) => ({
      id: card.id,
      title: card.title,
      kind: card.type,
      state: card.state,
      owner: card.owner,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
      attributes: {
        'kanban/lane': card.lane,
        'kanban/owner': card.owner,
        'kanban/type': card.type,
        'kanban/labels': card.labels,
      },
    })),
    edges: included.flatMap((card) =>
      card.epicId && ids.has(card.epicId)
        ? [{ kind: 'parent-of' as const, from: card.epicId, to: card.id }]
        : [],
    ),
  };
}

export function graphStatus(item: GraphNode): string {
  if (item.state === 'closed') return 'closed';
  const lane = item.attributes['kanban/lane'];
  if (typeof lane === 'string') return lane;
  const owner = item.attributes['kanban/owner'] ?? item.attributes['owner'];
  // The exported subtree cannot prove readiness against dependencies outside it.
  return owner ? 'assigned' : item.state;
}

export function graphBody(attributes: Record<string, JsonValue>): string {
  const body = attributes['body'] ?? attributes['kanban/body'];
  return typeof body === 'string' ? body : '';
}

export type GraphSource =
  | { kind: 'loading' }
  | { kind: 'unavailable'; error: Error }
  | { kind: 'ready'; graph: CardGraph; error: Error | null };

export interface ReadyGraphLayout {
  kind: 'ready';
  nodes: IssueGraphNode[];
  edges: Edge[];
}

export type GraphLayout =
  ReadyGraphLayout | { kind: 'empty' } | { kind: 'too-large'; count: number };

export function layoutGraph(graph: CardGraph, includeClosed: boolean): GraphLayout {
  const children = graph.nodes.filter(
    (node) => includeClosed || node.state !== 'closed' || node.id === graph.rootId,
  );
  const ids = new Set(children.map((item) => item.id));
  // Keep ancestor context for any live descendants, even when an ancestor is closed.
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges)
      if (edge.kind === 'parent-of' && ids.has(edge.to) && !ids.has(edge.from)) {
        ids.add(edge.from);
        changed = true;
      }
  }
  const items = graph.nodes.filter((item) => ids.has(item.id));
  if (items.length === 0) return { kind: 'empty' };
  if (items.length > 150) return { kind: 'too-large', count: items.length };
  const itemIds = new Set(items.map((item) => item.id));
  const validEdges = graph.edges.filter((edge) => itemIds.has(edge.from) && itemIds.has(edge.to));
  const layout = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  layout.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 95, marginx: 35, marginy: 35 });
  for (const item of items) layout.setNode(item.id, { width: 260, height: 110 });
  for (const edge of validEdges) {
    // Dependencies point at prerequisites; layout places prerequisites before their dependents.
    if (edge.kind === 'parent-of') layout.setEdge(edge.from, edge.to, { weight: 3 });
    else layout.setEdge(edge.to, edge.from, { weight: 1 });
  }
  runLayout(layout);
  return {
    kind: 'ready',
    nodes: items.map((item) => {
      const position = layout.node(item.id);
      const blocked =
        item.state !== 'closed' &&
        validEdges.some(
          (edge) =>
            edge.kind === 'depends-on' &&
            edge.from === item.id &&
            items.some((other) => other.id === edge.to && other.state !== 'closed'),
        );
      return {
        id: item.id,
        type: 'issue',
        position: { x: position.x - 130, y: position.y - 55 },
        data: { item, status: blocked ? 'blocked' : graphStatus(item) },
      };
    }),
    edges: validEdges.map((edge, index) => ({
      id: `${edge.kind}-${edge.from}-${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      label: edge.kind === 'depends-on' ? 'depends on' : undefined,
      style: {
        stroke: edge.kind === 'depends-on' ? 'var(--graph-dependency)' : 'var(--graph-hierarchy)',
        strokeWidth: 1.5,
        strokeDasharray: edge.kind === 'depends-on' ? '5 4' : undefined,
      },
      labelStyle: { fontSize: 10, fill: 'var(--graph-label)' },
      labelBgStyle: { fill: 'var(--graph-canvas)', fillOpacity: 0.95 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edge.kind === 'depends-on' ? 'var(--graph-dependency)' : 'var(--graph-hierarchy)',
        width: 16,
        height: 16,
      },
    })),
  };
}
