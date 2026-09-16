import { z } from 'zod';
import { reviewStages, type ReviewScope, type ReviewStage } from '../../shared/reviews';
import type {
  CardType,
  LabelTerm,
  Lane,
  Priority,
  ViewFilter,
  WorkspaceOption,
} from '../../shared/api';
import { emptyFilter } from './board';

export type Presentation = 'overview' | 'board' | 'outline' | 'graph' | 'agents' | 'reviews';
export type DetailTab = 'overview' | 'activity' | 'attributes';
export interface DashboardSearch {
  mode: Presentation;
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

const recordSchema = z.compile(z.record(z.string(), z.unknown()), { strict: true });
const textSchema = z.compile(z.string().min(1), { strict: true });
const arraySchema = z.compile(z.array(z.unknown()), { strict: true });
const labelTermSchema = z.compile(z.enum(['include', 'exclude']), { strict: true });
const modeSchema = z.compile(
  z.enum(['overview', 'board', 'outline', 'graph', 'agents', 'reviews']),
  { strict: true },
);
const reviewScopeSchema = z.compile(z.enum(['inbox', 'all']), { strict: true });
const reviewStageSchema = z.compile(z.enum(reviewStages), { strict: true });
const detailTabSchema = z.compile(z.enum(['overview', 'activity', 'attributes']), {
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
  const parsed = parseOptional(arraySchema, value);
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
  const issue = agent ? null : text(search.issue);
  const mode = parseOptional(modeSchema, search.mode);
  return {
    mode: mode ?? (workspace || issue || agent ? 'board' : 'overview'),
    workspace,
    review: text(search.review),
    reviewQuery: text(search.reviewQuery) ?? '',
    reviewScope: parseOptional(reviewScopeSchema, search.reviewScope) ?? 'inbox',
    reviewStage: parseOptional(reviewStageSchema, search.reviewStage),
    issue,
    agent,
    agentRun: agent ? text(search.agentRun) : null,
    filter,
    activeViewId: text(search.activeViewId),
    graphRoot: text(search.graphRoot),
    detailTab: parseOptional(detailTabSchema, search.detailTab) ?? 'overview',
    agentQuery: text(search.agentQuery) ?? '',
    activeAgentsOnly: parseOptional(trueSchema, search.activeAgentsOnly) ?? false,
  };
}

export const dashboardSearchDefaults = {
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
    mode: search.mode === 'agents' || search.mode === 'reviews' ? 'board' : search.mode,
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
