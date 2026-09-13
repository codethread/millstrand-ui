import type {
  CardType,
  LabelTerm,
  Lane,
  Priority,
  ViewFilter,
  WorkspaceOption,
} from '../../shared/api';
import { emptyFilter } from './board';

export type Presentation = 'overview' | 'board' | 'outline' | 'graph' | 'agents';
export type DetailTab = 'overview' | 'activity' | 'attributes';
export interface DashboardSearch {
  mode: Presentation;
  workspace: string | null;
  issue: string | null;
  agent: string | null;
  filter: ViewFilter;
  activeViewId: string | null;
  graphRoot: string | null;
  detailTab: DetailTab;
  agentQuery: string;
  activeAgentsOnly: boolean;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
function choices<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return allowed.filter((item) => value.includes(item));
}

/** Invalid URL fields return to their documented defaults independently. */
export function parseDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  const value = record(search.filter);
  const terms: Record<string, LabelTerm> = Object.fromEntries(
    Object.entries(record(value.terms)).filter(
      (entry): entry is [string, LabelTerm] => entry[1] === 'include' || entry[1] === 'exclude',
    ),
  );
  const filter: ViewFilter = {
    query: text(value.query) ?? '',
    mode: value.mode === 'or' ? 'or' : 'and',
    terms,
    lanes: choices<Lane>(value.lanes, [
      'refinement',
      'pending',
      'claimed',
      'in_review',
      'closed',
      'unknown',
    ]),
    types: choices<CardType>(value.types, ['epic', 'feature']),
    priorities: choices<Priority>(value.priorities, ['p1', 'p2', 'p3', 'p4']),
    includeClosed: value.includeClosed === true,
  };
  const workspace = text(search.workspace);
  const agent = text(search.agent);
  const issue = agent ? null : text(search.issue);
  const mode = search.mode;
  return {
    mode:
      mode === 'overview' ||
      mode === 'board' ||
      mode === 'outline' ||
      mode === 'graph' ||
      mode === 'agents'
        ? mode
        : workspace || issue || agent
          ? 'board'
          : 'overview',
    workspace,
    issue,
    agent,
    filter,
    activeViewId: text(search.activeViewId),
    graphRoot: text(search.graphRoot),
    detailTab:
      search.detailTab === 'activity' || search.detailTab === 'attributes'
        ? search.detailTab
        : 'overview',
    agentQuery: text(search.agentQuery) ?? '',
    activeAgentsOnly: search.activeAgentsOnly === true,
  };
}

export const dashboardSearchDefaults = {
  workspace: null,
  issue: null,
  agent: null,
  filter: emptyFilter(),
  activeViewId: null,
  graphRoot: null,
  detailTab: 'overview',
  agentQuery: '',
  activeAgentsOnly: false,
} satisfies Partial<DashboardSearch>;

/** The unscoped default works without discovery; explicit IDs require a running weaver. */
export function pinnableWorkspaceId(
  workspaces: WorkspaceOption[],
  path: string | null,
): string | null {
  return (
    workspaces.find((workspace) => workspace.path === path && workspace.status === 'running')?.id ??
    null
  );
}

/** Manual filter edits no longer represent the selected saved view snapshot. */
export function manualFilterSearch(
  search: DashboardSearch,
  filter: ViewFilter,
): Partial<DashboardSearch> {
  return {
    filter,
    activeViewId: null,
    graphRoot: null,
    mode: search.mode === 'agents' ? 'board' : search.mode,
  };
}

type WorkspaceDestination =
  { kind: 'board' } | { kind: 'card'; id: string } | { kind: 'agent'; id: string };

/** Cross-weaver links start clean; Back restores the exact prior dashboard. */
export function workspaceDestination(
  workspace: string,
  item: WorkspaceDestination,
): DashboardSearch {
  return {
    ...dashboardSearchDefaults,
    workspace,
    mode: item.kind === 'agent' ? 'agents' : 'board',
    issue: item.kind === 'card' ? item.id : null,
    agent: item.kind === 'agent' ? item.id : null,
    activeAgentsOnly: item.kind === 'agent',
  };
}

/** Explicit workspace routes reject offline weavers, so stale activity is not actionable. */
export function workspaceActivityDestination(
  workspace: WorkspaceOption,
  item: WorkspaceDestination,
): DashboardSearch | null {
  return workspace.status === 'running' ? workspaceDestination(workspace.id, item) : null;
}
