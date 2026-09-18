import { describe, expect, it } from 'vitest';
import type { Card, CardGraph, GraphNode } from '../../shared/api';
import { emptyFilter, issueSurfaceContent } from './board';
import { graphFromCards, layoutGraph } from './graph';

function node(id: string, state = 'active'): GraphNode {
  return { id, title: id, kind: 'task', state, attributes: {}, createdAt: null, updatedAt: null };
}

function card(id: string, epicId: string | null = null): Card {
  return {
    id,
    title: id,
    type: epicId === null ? 'epic' : 'feature',
    epicId,
    state: 'active',
    lane: 'pending',
    priority: 'p2',
    owner: null,
    branch: null,
    worktree: null,
    source: null,
    outcome: null,
    labels: [],
    autoRun: null,
    createdAt: '2026-09-18',
    updatedAt: null,
  };
}

describe('graph inputs and layout', () => {
  it('uses issue membership with unmatched parent context but no unmatched siblings', () => {
    const all = [card('parent'), card('match', 'parent'), card('other', 'parent')];
    const projection = issueSurfaceContent(all, { ...emptyFilter(), query: 'match' });
    const graph = graphFromCards(projection.cards, projection.allCards);
    expect(graph.nodes.map((item) => item.id)).toEqual(['parent', 'match']);
    expect(graph.edges).toEqual([{ kind: 'parent-of', from: 'parent', to: 'match' }]);
  });

  it('retains closed ancestors transitively and the focused root, not closed leaves', () => {
    const graph: CardGraph = {
      rootId: 'root',
      nodes: [
        node('root', 'closed'),
        node('ancestor', 'closed'),
        node('live'),
        node('closed', 'closed'),
      ],
      edges: [
        { kind: 'parent-of', from: 'ancestor', to: 'live' },
        { kind: 'parent-of', from: 'root', to: 'ancestor' },
        { kind: 'parent-of', from: 'root', to: 'closed' },
      ],
    };
    const result = layoutGraph(graph, false);
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('Expected layout');
    expect(result.nodes.map((item) => item.id)).toEqual(['root', 'ancestor', 'live']);
    expect(result.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['ancestor', 'live'],
      ['root', 'ancestor'],
    ]);
    const expanded = layoutGraph(graph, true);
    expect(expanded.kind === 'ready' && expanded.nodes.length).toBe(4);
    expect(
      layoutGraph({ rootId: 'root', nodes: [node('root', 'closed')], edges: [] }, false).kind,
    ).toBe('ready');
  });

  it('draws dependencies toward prerequisites but positions prerequisites before dependents', () => {
    const graph: CardGraph = {
      rootId: 'parent',
      nodes: [node('parent'), node('dependent'), node('prerequisite')],
      edges: [
        { kind: 'parent-of', from: 'parent', to: 'prerequisite' },
        { kind: 'depends-on', from: 'dependent', to: 'prerequisite' },
      ],
    };
    const result = layoutGraph(graph, false);
    if (result.kind !== 'ready') throw new Error('Expected layout');
    const parent = result.nodes.find((item) => item.id === 'parent');
    const prerequisite = result.nodes.find((item) => item.id === 'prerequisite');
    const dependent = result.nodes.find((item) => item.id === 'dependent');
    expect(parent?.position.x).toBeLessThan(prerequisite?.position.x ?? 0);
    expect(prerequisite?.position.x).toBeLessThan(dependent?.position.x ?? 0);
    expect(dependent?.data.status).toBe('blocked');
    expect(result.edges[1]).toMatchObject({
      source: 'dependent',
      target: 'prerequisite',
      label: 'depends on',
    });
    const completed = layoutGraph(
      {
        ...graph,
        nodes: graph.nodes.map((item) =>
          item.id === 'prerequisite' ? { ...item, state: 'closed' } : item,
        ),
      },
      true,
    );
    expect(
      completed.kind === 'ready' &&
        completed.nodes.find((item) => item.id === 'dependent')?.data.status,
    ).toBe('active');
  });

  it('does not send dangling ancestor edges to Dagre', () => {
    const result = layoutGraph(
      {
        rootId: '',
        nodes: [node('live')],
        edges: [{ kind: 'parent-of', from: 'missing', to: 'live' }],
      },
      false,
    );
    expect(result.kind === 'ready' && result.edges).toEqual([]);
    expect(result.kind === 'ready' && result.nodes[0]?.position.x).toEqual(expect.any(Number));
  });

  it('distinguishes empty from the 150-node safety boundary after closed filtering', () => {
    expect(
      layoutGraph({ rootId: '', nodes: [node('closed', 'closed')], edges: [] }, false),
    ).toEqual({ kind: 'empty' });
    const nodes = Array.from({ length: 150 }, (_, index) => node(String(index)));
    expect(layoutGraph({ rootId: '', nodes, edges: [] }, false).kind).toBe('ready');
    const graph = { rootId: '', nodes: [...nodes, node('extra', 'closed')], edges: [] };
    expect(layoutGraph(graph, false).kind).toBe('ready');
    expect(layoutGraph(graph, true)).toEqual({ kind: 'too-large', count: 151 });
  });
});
