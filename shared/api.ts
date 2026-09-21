/** Normalized dashboard contract. Missing source values become explicit nulls. */
export type CardType = 'epic' | 'feature';
export type Lane =
  'refinement' | 'pending' | 'claimed' | 'in_review' | 'in_production' | 'closed' | 'unknown';
export type CardLane = Exclude<Lane, 'unknown'>;
export type CardAction = { kind: 'move'; lane: CardLane } | { kind: 'delete' };

export type Priority = 'p1' | 'p2' | 'p3' | 'p4';
export type TaskStatus = 'ready' | 'doing' | 'blocked' | 'closed';
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Recorded configuration and dispatcher snapshot, never agent process activity. */
export interface AutoRun {
  optedIn: boolean;
  seat: string | null;
  effort: string | null;
  workflow: string | null;
  status: 'preparing' | 'assigned' | 'error' | null;
  runId: string | null;
  workflowRunId: string | null;
  error: string | null;
  worktree: string | null;
  branch: string | null;
}

export type AttributionStatus = 'resolved' | 'unresolved' | 'ambiguous';

/** Raw friendly identity plus graph-enrichment state. Empty IDs never imply a guessed match. */
export interface IdentityAttribution {
  identity: string;
  status: AttributionStatus;
  identityStrandIds: string[];
}

export interface OwnershipClaim {
  id: string;
  owner: IdentityAttribution;
  actor: IdentityAttribution | null;
  claimedAt: string;
  order: number;
  branch: string | null;
  worktree: string | null;
  runId: string | null;
}

export interface CardOwnership {
  current: OwnershipClaim | null;
  history: OwnershipClaim[];
}

export interface DependencyCounts {
  incoming: number;
  outgoing: number;
}

export interface Card {
  id: string;
  title: string;
  type: CardType;
  state: string;
  lane: Lane;
  priority: Priority;
  epicId: string | null;
  dependencies: DependencyCounts;
  /** Convenience projection of ownership.current.owner.identity. */
  owner: string | null;
  reporter: IdentityAttribution | null;
  ownership: CardOwnership;
  branch: string | null;
  worktree: string | null;
  source: string | null;
  outcome: string | null;
  labels: string[];
  autoRun: AutoRun | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface Board {
  workspace: { path: string; name: string };
  fetchedAt: string;
  cards: Card[];
  labels: { label: string; count: number }[];
}

export type AgentRunStatus = 'ready' | 'running' | 'stopped' | 'failed' | 'unknown';

export type LogContinuation =
  | { kind: 'native-resume'; predecessorRunId: string }
  | { kind: 'fresh-retry'; predecessorRunId: string };

export interface AgentRun {
  id: string;
  requestId: string | null;
  title: string;
  alias: string;
  harness: string;
  status: AgentRunStatus;
  substatus: string | null;
  mode: string;
  model: string | null;
  effort: string | null;
  cwd: string | null;
  target: string | null;
  rootTargets: string[];
  participants: IdentityAttribution[];
  continuation: LogContinuation | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AgentWork {
  id: string;
  title: string;
  state: string;
  kind: 'card' | 'task' | 'work';
}

export interface AgentIdentity {
  id: string;
  strandId: string;
  harness: string;
  model: string | null;
  effort: string | null;
  createdAt: string;
  runs: AgentRun[];
  work: AgentWork[];
}

export interface AgentDirectory {
  workspace: { path: string; name: string };
  fetchedAt: string;
  identities: AgentIdentity[];
  /** Every published run, including unresolved participants not present in the registry. */
  runs: AgentRun[];
}

export interface AgentOption {
  name: string;
  description: string | null;
  model: string | null;
}

export type AgentPrompt = {
  targetId: string;
  alias: string;
  prompt: string;
  requestId: string;
} & ({ targetKind?: 'review' } | { targetKind: 'review-comment'; comment: CommentPromptReference });

export interface CommentPromptReference {
  id: string;
  revision: string;
  candidateVersion: number;
}

/** The allowlisted run inspection response; provider logs and injected prompts stay private. */
export interface AgentReply {
  id: string;
  title: string;
  alias: string;
  identity: string | null;
  target: string | null;
  status: AgentRunStatus;
  substatus: string | null;
  result: string | null;
  error: string | null;
  prompt:
    | (
        | { kind: 'card'; cardId: string; text: string }
        | { kind: 'review'; cardId: string; text: string; context: string }
        | {
            kind: 'review-comment';
            cardId: string;
            text: string;
            context: string;
            comment: CommentPromptReference;
          }
      )
    | null;
}

export type WeaverOperation = 'start' | 'stop' | 'restart';

export interface WorkspaceOption {
  id: string;
  name: string;
  path: string;
  status: 'running' | 'offline';
}

export interface Note {
  id: string;
  text: string;
  at: string;
  actor: IdentityAttribution | null;
  kind: string | null;
  truncated: boolean;
}

export type TaskOwnership =
  | { source: 'direct'; claim: OwnershipClaim }
  | { source: 'inherited'; featureId: string; claim: OwnershipClaim };

export interface Task {
  id: string;
  title: string;
  state: string;
  status: TaskStatus;
  /** Convenience projection of ownership.claim.owner.identity. */
  owner: string | null;
  ownerSource: TaskOwnership['source'] | null;
  ownership: TaskOwnership | null;
  body: string;
  latestNote: Note | null;
}

export interface WorkItem {
  id: string;
  title: string;
  state: string;
  attributes: Record<string, JsonValue>;
  createdAt: string | null;
  updatedAt: string | null;
}

export type Relation =
  { kind: 'depends-on'; item: WorkItem } | { kind: 'depended-on-by'; item: WorkItem };

export interface CardDetail {
  card: Card;
  body: string;
  attributes: Record<string, JsonValue>;
  tasks: Task[];
  notes: Note[];
  activeWork: WorkItem[];
  ready: WorkItem[];
  related: Relation[];
}

export interface GraphNode extends WorkItem {
  dependencies: DependencyCounts;
  kind: 'epic' | 'feature' | 'task' | 'work';
  owner: string | null;
}

export type GraphEdge =
  | { kind: 'parent-of'; from: string; to: string }
  | { kind: 'depends-on'; from: string; to: string };

export interface CardGraph {
  rootId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type LabelTerm = 'include' | 'exclude';
export interface ViewFilter {
  query: string;
  mode: 'and' | 'or';
  terms: Record<string, LabelTerm>;
  lanes: Lane[];
  types: CardType[];
  priorities: Priority[];
  includeClosed: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  filter: ViewFilter;
}

export type LabelChange =
  { action: 'add'; labels: string[] } | { action: 'remove'; labels: string[] };

export interface ApiError {
  error: string;
}

/**
 * GET /api/workspaces → WorkspaceOption[] (known local mill weavers)
 * POST /api/workspaces/:id/lifecycle, { operation: WeaverOperation } → { ok: true }
 * GET /api/agents → AgentDirectory (identities, tracked runs, and owned work)
 * GET /api/agent-options → AgentOption[] (available headless harnesses and aliases)
 * GET /api/agent-runs/:id → AgentReply
 * POST /api/cards/:id/agent-runs, AgentPrompt → AgentReply
 * GET /api/dependencies → CardGraph (workspace dependency endpoints and directed edges)
 * GET /api/board → Board
 * GET /api/cards/:id → CardDetail
 * GET /api/cards/:id/graph → CardGraph
 * GET /api/cards/:id/tasks/:taskId/notes → Note[]
 * PATCH /api/cards/:id/labels, LabelChange → CardDetail
 * PATCH /api/cards/:id/lane, { lane: CardLane } → { ok: true }
 * DELETE /api/cards/:id → { ok: true } (only this card and its incident links)
 * GET /api/views → SavedView[]
 * PUT /api/views, SavedView[] → SavedView[]
 * Scoped routes accept ?workspace=<WorkspaceOption.id>; omission uses the startup workspace.
 * All failures are non-2xx with ApiError.
 */
