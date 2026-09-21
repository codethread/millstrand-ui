import { sorted } from '../../shared/array';
import { describe, expect, it } from 'vitest';
import type { Card, CardGraph, GraphNode } from '../../shared/api';
import { emptyFilter, issueSurfaceContent } from './board';
import {
  dependencyLayout,
  graphFromCards,
  graphHierarchyRoot,
  graphFocusTargets,
  layoutGraph,
} from './graph';

function node(id: string, state = 'active'): GraphNode {
  return {
    id,
    title: id,
    kind: 'task',
    state,
    owner: null,
    dependencies: { incoming: 0, outgoing: 0 },
    attributes: {},
    createdAt: null,
    updatedAt: null,
  };
}

function card(id: string, epicId: string | null = null): Card {
  return {
    id,
    title: id,
    type: epicId === null ? 'epic' : 'feature',
    epicId,
    dependencies: { incoming: 0, outgoing: 0 },
    state: 'active',
    lane: 'pending',
    priority: 'p2',
    owner: null,
    reporter: null,
    ownership: { current: null, history: [] },
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

describe('explicit direct dependency exploration', () => {
  const base: CardGraph = {
    rootId: 'root',
    nodes: [
      { ...node('root'), dependencies: { incoming: 1, outgoing: 1 } },
      node('task'),
      node('closed-task', 'closed'),
    ],
    edges: [
      { kind: 'parent-of', from: 'root', to: 'task' },
      { kind: 'parent-of', from: 'root', to: 'closed-task' },
    ],
  };
  const dependencies: CardGraph = {
    rootId: '',
    nodes: [
      node('root'),
      { ...node('outside', 'closed'), dependencies: { incoming: 1, outgoing: 1 } },
      node('incoming'),
      node('two-hops'),
    ],
    edges: [
      { kind: 'depends-on', from: 'root', to: 'outside' },
      { kind: 'depends-on', from: 'incoming', to: 'root' },
      { kind: 'depends-on', from: 'outside', to: 'two-hops' },
    ],
  };
  it('uses authoritative node counts without needing the workspace dependency response', () => {
    const result = dependencyLayout(base, dependencies, [], {
      includeClosed: false,
      showTasks: true,
    });
    if (result.kind !== 'ready') throw new Error('Expected layout');
    expect(result.nodes.map((n) => n.id)).toEqual(['root', 'task']);
    expect(result.nodes[0]?.data.item.dependencies).toEqual({ incoming: 1, outgoing: 1 });
    expect(result.edges).toHaveLength(1);
    const missing = dependencyLayout(base, null, [], { includeClosed: false, showTasks: true });
    expect(missing.kind === 'ready' && missing.nodes[0]?.data.item.dependencies).toEqual({
      incoming: 1,
      outgoing: 1,
    });
  });
  it('expands only direct neighbours, including closed external cards, with explicit distinction', () => {
    const result = dependencyLayout(base, dependencies, ['root'], {
      includeClosed: false,
      showTasks: true,
    });
    if (result.kind !== 'ready') throw new Error('Expected layout');
    expect(
      sorted(
        result.nodes.map((n) => n.id),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(['incoming', 'outside', 'root', 'task']);
    expect(result.nodes.find((n) => n.id === 'outside')?.data).toMatchObject({
      context: 'dependency',
      item: { dependencies: { incoming: 1, outgoing: 1 } },
    });
    expect(result.nodes.find((n) => n.id === 'root')?.data.context).toBe('hierarchy-focus');
    expect(result.edges.map((e) => [e.source, e.target])).toContainEqual(['incoming', 'root']);
  });
  it('keeps shared edges when one root is hidden and removes unrequested second hops', () => {
    const expanded = dependencyLayout(base, dependencies, ['root', 'outside'], {
      includeClosed: false,
      showTasks: true,
    });
    if (expanded.kind !== 'ready') throw new Error('Expected layout');
    expect(expanded.edges).toHaveLength(4);
    const hidden = dependencyLayout(base, dependencies, ['outside'], {
      includeClosed: false,
      showTasks: true,
    });
    if (hidden.kind !== 'ready') throw new Error('Expected layout');
    expect(
      sorted(
        hidden.nodes.map((n) => n.id),
        (a, b) => a.localeCompare(b),
      ),
    ).toEqual(['outside', 'root', 'task', 'two-hops']);
    expect(hidden.edges.map((e) => [e.source, e.target])).toContainEqual(['root', 'outside']);
  });
  it('resetting expansions restores only the original hierarchy', () => {
    const result = dependencyLayout(base, dependencies, [], {
      includeClosed: false,
      showTasks: true,
    });
    expect(result.kind === 'ready' && result.nodes.map((n) => n.id)).toEqual(['root', 'task']);
  });
});

it('focuses a feature through its epic and a task through its owning card, not dependencies', () => {
  const cards = [
    card('epic'),
    card('feature', 'epic'),
    card('sibling', 'epic'),
    { ...card('standalone'), type: 'feature' as const },
  ];
  const graph: CardGraph = {
    rootId: 'epic',
    nodes: [node('epic'), node('feature'), node('sibling'), node('task'), node('work')],
    edges: [
      { kind: 'parent-of', from: 'epic', to: 'feature' },
      { kind: 'parent-of', from: 'epic', to: 'sibling' },
      { kind: 'parent-of', from: 'feature', to: 'task' },
      { kind: 'depends-on', from: 'feature', to: 'work' },
    ],
  };
  expect(graphHierarchyRoot('feature', cards)).toBe('epic');
  expect(graphHierarchyRoot('standalone', cards)).toBe('standalone');
  expect(graphHierarchyRoot(null, cards)).toBeNull();
  expect(graphFocusTargets(graph, cards).get('task')).toBe('feature');
  expect(graphFocusTargets(graph, cards).get('work')).toBeUndefined();
  expect(graphFocusTargets(graph, cards).get('standalone')).toBe('standalone');
  const focused = {
    ...graph,
    rootId: 'feature',
    nodes: graph.nodes.map((n) => (n.id === 'feature' ? { ...n, state: 'closed' } : n)),
  };
  const result = dependencyLayout(focused, null, [], { includeClosed: false, showTasks: true });
  if (result.kind !== 'ready') throw new Error('Expected layout');
  expect(result.nodes.map((n) => n.id)).toContain('sibling');
  expect(result.nodes.find((n) => n.id === 'feature')?.data.context).toBe('hierarchy-focus');
  expect(result.nodes.find((n) => n.id === 'epic')?.data.context).toBe('hierarchy');
});

it('hides hierarchy and dependency tasks without clearing expansions or changing full counts', () => {
  const root: GraphNode = {
    ...node('root'),
    kind: 'feature',
    dependencies: { incoming: 0, outgoing: 2 },
  };
  const base: CardGraph = {
    rootId: 'root',
    nodes: [root, node('child')],
    edges: [{ kind: 'parent-of', from: 'root', to: 'child' }],
  };
  const dependencies: CardGraph = {
    rootId: '',
    nodes: [
      root,
      node('outside-task', 'closed'),
      { ...node('outside-card', 'closed'), kind: 'feature' },
    ],
    edges: [
      { kind: 'depends-on', from: 'root', to: 'outside-task' },
      { kind: 'depends-on', from: 'root', to: 'outside-card' },
    ],
  };
  for (const includeClosed of [false, true]) {
    const hidden = dependencyLayout(base, dependencies, ['root'], {
      includeClosed,
      showTasks: false,
    });
    if (hidden.kind !== 'ready') throw new Error('Expected layout');
    expect(hidden.nodes.map((item) => item.id)).toEqual(['root', 'outside-card']);
    expect(hidden.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['root', 'outside-card'],
    ]);
    expect(hidden.nodes[0]?.data).toMatchObject({
      expanded: true,
      item: { dependencies: root.dependencies },
    });
    const shown = dependencyLayout(base, dependencies, ['root'], {
      includeClosed,
      showTasks: true,
    });
    expect(
      shown.kind === 'ready' &&
        sorted(
          shown.nodes.map((item) => item.id),
          (a, b) => a.localeCompare(b),
        ),
    ).toEqual(['child', 'outside-card', 'outside-task', 'root']);
  }
});

it('applies task visibility before the graph size limit', () => {
  const base: CardGraph = {
    rootId: 'root',
    nodes: [
      { ...node('root'), kind: 'feature' },
      ...Array.from({ length: 150 }, (_, index) => node(`task-${index}`)),
    ],
    edges: [],
  };
  expect(dependencyLayout(base, null, [], { includeClosed: true, showTasks: true })).toEqual({
    kind: 'too-large',
    count: 151,
  });
  const hidden = dependencyLayout(base, null, [], { includeClosed: true, showTasks: false });
  expect(hidden.kind === 'ready' && hidden.nodes.map((item) => item.id)).toEqual(['root']);
});
