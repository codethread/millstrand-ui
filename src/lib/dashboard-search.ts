import { z } from 'zod';
import { reviewStages, type ReviewScope, type ReviewStage } from '../../shared/reviews';
import type {
  CardType,
  LabelTerm,
  Lane,
  Priority,
  SavedView,
  ViewFilter,
  WorkspaceOption,
} from '../../shared/api';
import { emptyFilter, workspaceFilter, type WorkspaceView } from './board';

export type Presentation =
  'overview' | 'board' | 'outline' | 'graph' | 'agents' | 'reviews' | 'completed';
export type HistoryLayout = 'timeline' | 'recap' | 'ledger';
export type DetailTab = 'overview' | 'notes' | 'agents' | 'attributes';
export interface DashboardSearch {
  mode: Presentation;
  historyLayout: HistoryLayout;
  historyDay: string | null;
  historyQuery: string;
  workspace: string | null;
  issue: string | null;
  agent: string | null;
  agentRun: string | null;
  review: string | null;
  reviewQuery: string;
  reviewScope: ReviewScope;
  reviewStage: ReviewStage | null;
  filter: ViewFilter;
  activeViewId: string | null;
  graphRoot: string | null;
  detailTab: DetailTab;
  agentQuery: string;
  activeAgentsOnly: boolean;
}

const recordSchema = z.compile(z.object({}).loose(), { strict: true });
const textSchema = z.compile(z.string().min(1), { strict: true });
const stringArraySchema = z.compile(z.array(z.string()), { strict: true });
const labelTermSchema = z.compile(z.enum(['include', 'exclude']), { strict: true });
const modeSchema = z.compile(
  z.enum(['overview', 'board', 'outline', 'graph', 'agents', 'reviews', 'completed']),
  { strict: true },
);
const historyLayoutSchema = z.compile(z.enum(['timeline', 'recap', 'ledger']), { strict: true });
const historyDaySchema = z.compile(z.iso.date(), { strict: true });
const reviewScopeSchema = z.compile(z.enum(['inbox', 'all']), { strict: true });
const reviewStageSchema = z.compile(z.enum(reviewStages), { strict: true });
const detailTabSchema = z.compile(z.enum(['overview', 'notes', 'agents', 'attributes']), {
  strict: true,
});
const trueSchema = z.compile(z.literal(true), { strict: true });

function parseOptional<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function record(value: unknown): Record<string, unknown> {
  return parseOptional(recordSchema, value) ?? {};
}
function text(value: unknown): string | null {
  return parseOptional(textSchema, value);
}
function choices<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const parsed = parseOptional(stringArraySchema, value);
  return parsed === null ? [] : allowed.filter((item) => parsed.includes(item));
}
function labelTerm(value: unknown): LabelTerm | null {
  return parseOptional(labelTermSchema, value);
}

/** Invalid URL fields return to their documented defaults independently. */
export function parseDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  const value = record(search.filter);
  const terms: Record<string, LabelTerm> = Object.fromEntries(
    Object.entries(record(value.terms)).flatMap(([key, item]) => {
      const term = labelTerm(item);
      return term === null ? [] : [[key, term]];
    }),
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
      'in_production',
      'closed',
      'unknown',
    ]),
    types: choices<CardType>(value.types, ['epic', 'feature']),
    priorities: choices<Priority>(value.priorities, ['p1', 'p2', 'p3', 'p4']),
    includeClosed: value.includeClosed === true,
  };
  const workspace = text(search.workspace);
  const agent = text(search.agent);
  const agentRun = text(search.agentRun);
  const issue = agent || agentRun ? null : text(search.issue);
  const mode = parseOptional(modeSchema, search.mode);
  return {
    mode: mode ?? (agent || agentRun ? 'agents' : workspace || issue ? 'board' : 'overview'),
    workspace,
    historyLayout: parseOptional(historyLayoutSchema, search.historyLayout) ?? 'timeline',
    historyDay: parseOptional(historyDaySchema, search.historyDay),
    historyQuery: text(search.historyQuery) ?? '',
    review: text(search.review),
    reviewQuery: text(search.reviewQuery) ?? '',
    reviewScope: parseOptional(reviewScopeSchema, search.reviewScope) ?? 'inbox',
    reviewStage: parseOptional(reviewStageSchema, search.reviewStage),
    issue,
    agent,
    agentRun,
    filter,
    activeViewId: text(search.activeViewId),
    graphRoot: text(search.graphRoot),
    detailTab: parseOptional(detailTabSchema, search.detailTab) ?? 'overview',
    agentQuery: text(search.agentQuery) ?? '',
    activeAgentsOnly: parseOptional(trueSchema, search.activeAgentsOnly) ?? false,
  };
}

export const dashboardSearchDefaults = {
  historyLayout: 'timeline',
  historyDay: null,
  historyQuery: '',
  review: null,
  reviewQuery: '',
  reviewScope: 'inbox',
  reviewStage: null,
  workspace: null,
  issue: null,
  agent: null,
  agentRun: null,
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
    mode:
      search.mode === 'agents' || search.mode === 'reviews' || search.mode === 'completed'
        ? 'board'
        : search.mode,
  };
}

type WorkspaceDestination =
  { kind: 'board' } | { kind: 'card'; id: string } | { kind: 'agent'; id: string };

/** Selecting a saved view installs its immutable URL snapshot. */
export function savedViewSearch(
  search: DashboardSearch,
  view: SavedView | null,
): Partial<DashboardSearch> {
  return {
    filter: view?.filter ?? emptyFilter(),
    activeViewId: view?.id ?? null,
    graphRoot: null,
    mode:
      search.mode === 'agents' ||
      search.mode === 'reviews' ||
      search.mode === 'completed' ||
      search.mode === 'overview'
        ? 'board'
        : search.mode,
  };
}

/** Completed opens its dedicated history surface; other built-ins install board filters. */
export function workspaceViewSearch(
  search: DashboardSearch,
  view: WorkspaceView,
): Partial<DashboardSearch> {
  return {
    filter: workspaceFilter(view),
    issue: null,
    agent: null,
    agentRun: null,
    activeViewId: null,
    graphRoot: null,
    mode:
      view === 'completed'
        ? 'completed'
        : search.mode === 'agents' || search.mode === 'reviews' || search.mode === 'completed'
          ? 'board'
          : search.mode,
  };
}

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
