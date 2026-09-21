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
  type Node,
} from '@xyflow/react';
import { X } from 'lucide-react';
import type { GraphNode } from '../../shared/api';
import { graphBody, type ReadyGraphLayout, type IssueGraphNode } from '../lib/graph';
import { Button } from './ui/button';
import { Markdown } from './markdown';
import { PromptAgentButton } from './agent-prompt';
import {
  GraphDependencyMenu,
  GraphDependencyButton,
  type DependencyAction,
} from './graph-dependency-menu';
import '@xyflow/react/dist/style.css';

type InteractiveGraphNode = Node<
  IssueGraphNode['data'] & { action: DependencyAction; focus: DependencyAction },
  'issue'
>;

function GraphCard({ data }: NodeProps<InteractiveGraphNode>) {
  return (
    <GraphDependencyMenu action={data.action} focus={data.focus}>
      <div
        className={`graph-node graph-kind-${data.item.kind} ${data.context === 'dependency' ? 'border-dashed! border-2! border-amber-500/60!' : 'border-2! border-violet-400/60!'} ${data.context === 'hierarchy-focus' ? 'outline-2 outline-violet-500 outline-offset-2' : ''}`}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Left} id="dependency-source" />
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
          <span>
            {data.context === 'dependency'
              ? 'Added dependency'
              : data.context === 'hierarchy-focus'
                ? 'Hierarchy focus'
                : 'Hierarchy'}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
          <span>
            <span title="Outgoing dependencies: prerequisites">
              Depends on <b>{data.item.dependencies.outgoing}</b>
            </span>
            {' · '}
            <span title="Incoming dependencies: dependents">
              Required by <b>{data.item.dependencies.incoming}</b>
            </span>
          </span>
          <GraphDependencyButton id={data.item.id} action={data.action} focus={data.focus} />
        </div>
        <Handle type="source" position={Position.Right} />
        <Handle type="target" position={Position.Right} id="dependency-target" />
      </div>
    </GraphDependencyMenu>
  );
}
const nodeTypes = { issue: GraphCard };

/** Keyed by navigation intent by GraphView, never by refreshed node membership. */
export function GraphCanvas({
  layout,
  root,
  openCard,
  promptIds,
  toggleDependencies,
  focusTargets,
  focusHierarchy,
}: {
  layout: ReadyGraphLayout;
  root: string | null;
  openCard: (id: string) => void;
  promptIds: string[];
  toggleDependencies: (id: string) => void;
  focusTargets: ReadonlyMap<string, string>;
  focusHierarchy: (id: string) => void;
}) {
  const nodes = useMemo(
    () =>
      layout.nodes.map((node): InteractiveGraphNode => ({
        ...node,
        data: {
          ...node.data,
          focus: {
            label: 'Focus epic hierarchy',
            disabled: focusTargets.get(node.id) === undefined,
            run: () => {
              const target = focusTargets.get(node.id);
              if (target !== undefined) focusHierarchy(target);
            },
          },
          action: {
            label: node.data.expanded ? 'Hide dependencies' : 'View dependencies',
            disabled:
              !node.data.expanded &&
              node.data.item.dependencies.incoming + node.data.item.dependencies.outgoing === 0,
            run: () => toggleDependencies(node.id),
          },
        },
      })),
    [layout.nodes, toggleDependencies, focusTargets, focusHierarchy],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = layout.nodes.find((node) => node.id === selectedId)?.data.item ?? null;
  function selectNode(item: GraphNode) {
    if (item.kind === 'epic' || item.kind === 'feature') openCard(item.id);
    else setSelectedId(item.id);
  }
  return (
    <div
      className="graph-canvas"
      onKeyDownCapture={(event) => {
        if ((event.key !== 'Enter' && event.key !== ' ') || !(event.target instanceof HTMLElement))
          return;
        if (event.target.closest('button, [role=menuitem]')) return;
        const id = event.target.closest<HTMLElement>('.react-flow__node')?.dataset['id'];
        const item = layout.nodes.find((node) => node.id === id)?.data.item;
        if (item) {
          event.preventDefault();
          event.stopPropagation();
          selectNode(item);
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
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
        onNodeClick={(event, node) => {
          if (event.target instanceof Element && event.target.closest('button, [role=menu]'))
            return;
          selectNode(node.data.item);
        }}
        onPaneClick={() => setSelectedId(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--graph-dots)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#b4bac7" maskColor="var(--graph-canvas)" />
      </ReactFlow>
      <div className="graph-legend flex-wrap max-w-[calc(100%-32px)]">
        <span>
          <i />
          Parent → child
        </span>
        <span>
          <i className="dependency" />
          Depends on → prerequisite
        </span>
      </div>
      <div className="graph-help">
        Scroll to zoom · drag to pan · right-click or … for dependencies
      </div>
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
          {root && promptIds.includes(selected.id) && (
            <PromptAgentButton
              target={{ kind: 'card', cardId: root, id: selected.id, title: selected.title }}
            />
          )}
          <span className="text-xs text-muted-foreground">{selected.state}</span>
          {graphBody(selected.attributes) && <Markdown text={graphBody(selected.attributes)} />}
          <details>
            <summary>Attributes</summary>
            <pre className="raw-attributes">{JSON.stringify(selected.attributes, null, 2)}</pre>
          </details>
        </aside>
      )}
    </div>
  );
}
