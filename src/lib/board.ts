import type { Board, Card, Lane, SavedView, ViewFilter } from '../../shared/api';
import { sorted } from '../../shared/array';

export const lanes: { id: Lane; title: string; description: string }[] = [
  { id: 'refinement', title: 'Refinement', description: 'Ideas taking shape' },
  { id: 'pending', title: 'Ready', description: 'Ready to be picked up' },
  { id: 'claimed', title: 'In progress', description: 'Work in motion' },
  { id: 'in_review', title: 'In review', description: 'Ready for a second look' },
  {
    id: 'in_production',
    title: 'In production',
    description: 'Validation and release observation',
  },
  { id: 'closed', title: 'Completed', description: 'Finished and filed' },
  { id: 'unknown', title: 'Other', description: 'Outside the usual lanes' },
];

export function selectBoardLanes(cards: Card[], includeClosed: boolean) {
  return lanes.filter((lane) => {
    if (lane.id === 'in_production' || lane.id === 'unknown')
      return cards.some((card) => card.lane === lane.id);
    return lane.id !== 'closed' || includeClosed;
  });
}

export function emptyFilter(): ViewFilter {
  return {
    query: '',
    mode: 'and',
    terms: {},
    lanes: [],
    types: [],
    priorities: [],
    includeClosed: false,
  };
}

export type WorkspaceView = 'all' | 'progress' | 'review' | 'completed';

export function workspaceFilter(view: WorkspaceView): ViewFilter {
  const filter = emptyFilter();
  if (view === 'progress') filter.lanes = ['claimed'];
  if (view === 'review') filter.lanes = ['in_review'];
  if (view === 'completed') {
    filter.lanes = ['closed'];
    filter.includeClosed = true;
  }
  return filter;
}

export function matchesWorkspaceView(filter: ViewFilter, view: WorkspaceView): boolean {
  const preset = workspaceFilter(view);
  return (
    filter.query === '' &&
    Object.keys(filter.terms).length === 0 &&
    filter.types.length === 0 &&
    filter.priorities.length === 0 &&
    filter.includeClosed === preset.includeClosed &&
    filter.lanes.length === preset.lanes.length &&
    filter.lanes.every((lane) => preset.lanes.includes(lane))
  );
}

export function matchesCard(card: Card, filter: ViewFilter): boolean {
  if (!filter.includeClosed && card.state === 'closed') return false;
  if (filter.lanes.length && !filter.lanes.includes(card.lane)) return false;
  if (filter.types.length && !filter.types.includes(card.type)) return false;
  if (filter.priorities.length && !filter.priorities.includes(card.priority)) return false;
  const text = [card.id, card.title, card.owner, card.branch, ...card.labels]
    .join(' ')
    .toLowerCase();
  if (
    !filter.query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .every((word) => text.includes(word))
  )
    return false;
  const terms = Object.entries(filter.terms);
  if (terms.some(([label, term]) => term === 'exclude' && card.labels.includes(label)))
    return false;
  const includes = terms.filter(([, term]) => term === 'include').map(([label]) => label);
  return (
    includes.length === 0 ||
    (filter.mode === 'and'
      ? includes.every((label) => card.labels.includes(label))
      : includes.some((label) => card.labels.includes(label)))
  );
}

export function selectCards(cards: Card[], filter: ViewFilter): Card[] {
  return sorted(
    cards.filter((card) => matchesCard(card, filter)),
    (a, b) =>
      a.priority.localeCompare(b.priority) ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

export interface BoardSidebarContent {
  workspace: Board['workspace'];
  cards: Card[];
  labels: Board['labels'];
  summary: ReturnType<typeof boardSummary>;
}

export function boardSidebarContent(board: Board): BoardSidebarContent {
  return {
    workspace: board.workspace,
    cards: board.cards,
    labels: board.labels,
    summary: boardSummary(board),
  };
}

export function filteredCardCount(board: Board, filter: ViewFilter): number {
  return board.cards.filter((card) => matchesCard(card, filter)).length;
}

export interface IssueBoardContent {
  allCards: Card[];
  cards: Card[];
  columns: BoardColumn[];
  outline: OutlineGroup[];
}

export interface BoardCard {
  card: Card;
  parent: Card | null;
}

export interface BoardColumn {
  lane: (typeof lanes)[number];
  items: BoardCard[];
}

export function issueSurfaceContent(allCards: Card[], filter: ViewFilter): IssueBoardContent {
  const cards = selectCards(allCards, filter);
  const parents = new Map(allCards.map((card) => [card.id, card]));
  const columns = selectBoardLanes(cards, filter.includeClosed).map((lane) => ({
    lane,
    items: cards
      .filter((card) => card.lane === lane.id)
      .map((card) => ({
        card,
        parent: card.epicId === null ? null : (parents.get(card.epicId) ?? null),
      })),
  }));
  return { allCards, cards, columns, outline: selectOutline(allCards, cards) };
}

export interface SavedViewBoardContent {
  labels: Board['labels'];
  matchingCount: number;
}

export function savedViewBoardContent(board: Board, filter: ViewFilter): SavedViewBoardContent {
  return {
    labels: board.labels,
    matchingCount: filteredCardCount(board, filter),
  };
}

export interface OutlineGroup {
  parent: Card | null;
  cards: Card[];
  context: boolean;
}
export function selectOutline(allCards: Card[], visible: Card[]): OutlineGroup[] {
  const visibleIds = new Set(visible.map((card) => card.id));
  const epics = allCards.filter((card) => card.type === 'epic');
  const epicIds = new Set(epics.map((card) => card.id));
  const groups = epics
    .map((parent) => ({
      parent,
      cards: visible.filter((card) => card.epicId === parent.id),
      context: !visibleIds.has(parent.id),
    }))
    .filter((group) => visibleIds.has(group.parent.id) || group.cards.length > 0);
  const loose = visible.filter(
    (card) => card.type !== 'epic' && (card.epicId === null || !epicIds.has(card.epicId)),
  );
  return [...groups, ...(loose.length ? [{ parent: null, cards: loose, context: false }] : [])];
}

export function boardSummary(board: Board) {
  const active = board.cards.filter((card) => card.state !== 'closed');
  return {
    active: active.length,
    inProgress: active.filter((card) => card.lane === 'claimed').length,
    ready: active.filter((card) => card.lane === 'pending').length,
    review: active.filter((card) => card.lane === 'in_review').length,
    closed: board.cards.length - active.length,
  };
}

export function viewDescription(view: SavedView): string {
  const terms = Object.entries(view.filter.terms).map(
    ([label, term]) => `${term === 'exclude' ? '−' : '#'}${label}`,
  );
  return terms.length ? terms.join(view.filter.mode === 'and' ? ' & ' : ' / ') : 'Custom filters';
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  // Strand timestamps have no zone suffix; show their recorded wall-clock date.
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        date,
      );
}

export function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return formatDate(value);
}

export function labelColor(label: string): string {
  const hash = Array.from(label).reduce((value, char) => value + char.charCodeAt(0), 0);
  return ['violet', 'blue', 'amber', 'green', 'rose'][hash % 5] ?? 'violet';
}
