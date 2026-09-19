import { describe, expect, it } from 'vitest';
import type { Board, Card, ViewFilter } from '../../shared/api';
import { overviewCards } from './overview';
import {
  boardSidebarContent,
  completedHistory,
  completedDays,
  completedRecap,
  historyTimestamp,
  historyDateKey,
  shiftHistoryDay,
  emptyFilter,
  issueSurfaceContent,
  matchesWorkspaceView,
  savedViewBoardContent,
  selectBoardLanes,
  selectCards,
  selectOutline,
  workspaceFilter,
  type WorkspaceView,
} from './board';

function card(id: string, labels: string[] = []): Card {
  return {
    id,
    title: id,
    type: 'feature',
    state: 'pending',
    lane: 'pending',
    priority: 'p2',
    epicId: null,
    owner: null,
    branch: null,
    worktree: null,
    source: null,
    outcome: null,
    labels,
    autoRun: null,
    createdAt: '2026-09-12 10:00:00',
    updatedAt: null,
  };
}

describe('board content projections', () => {
  it('returns content without carrying refresh metadata into shell readers', () => {
    const active = card('active');
    const cards = [active, { ...card('closed'), state: 'closed', lane: 'closed' as const }];
    const labels = [{ label: 'platform', count: 1 }];
    const board: Board = {
      workspace: { path: '/workspace/.millstrand', name: 'Workspace' },
      fetchedAt: '2026-09-16T12:00:00Z',
      cards,
      labels,
    };
    const filter = { ...emptyFilter(), query: 'active' };

    expect(boardSidebarContent(board)).toEqual({
      workspace: board.workspace,
      cards,
      labels,
      summary: { active: 1, inProgress: 0, ready: 1, review: 0, closed: 1, done: 0 },
    });
    expect(issueSurfaceContent(board.cards, filter)).toMatchObject({
      allCards: cards,
      cards: [active],
    });
    expect(savedViewBoardContent(board, filter)).toEqual({ labels, matchingCount: 1 });
  });
});

describe('saved-view filters', () => {
  const labeledCards = [
    card('api', ['api']),
    card('both', ['api', 'web']),
    card('neither'),
    card('web', ['web']),
  ];

  it.each([
    { mode: 'and', expected: ['both'] },
    { mode: 'or', expected: ['api', 'both', 'web'] },
  ] satisfies { mode: ViewFilter['mode']; expected: string[] }[])(
    '$mode combines included labels',
    ({ mode, expected }) => {
      const filter: ViewFilter = {
        ...emptyFilter(),
        mode,
        terms: { api: 'include', web: 'include' },
      };
      expect(selectCards(labeledCards, filter).map((item) => item.id)).toEqual(expected);
    },
  );

  it.each(['and', 'or'] as const)('excluded labels veto a match in %s mode', (mode) => {
    const cards = [card('kept', ['api', 'web']), card('excluded', ['api', 'web', 'archived'])];
    const filter: ViewFilter = {
      ...emptyFilter(),
      mode,
      terms: { api: 'include', web: 'include', archived: 'exclude' },
    };
    expect(selectCards(cards, filter).map((item) => item.id)).toEqual(['kept']);
  });

  it.each(['and', 'or'] as const)(
    'a pure exclusion retains every other card in %s mode',
    (mode) => {
      const filter: ViewFilter = { ...emptyFilter(), mode, terms: { api: 'exclude' } };
      expect(selectCards(labeledCards, filter).map((item) => item.id)).toEqual(['neither', 'web']);
    },
  );

  it('hides completed cards by default and includes them when requested', () => {
    const cards: Card[] = [
      card('active'),
      { ...card('completed'), state: 'closed', lane: 'closed' },
    ];
    expect(selectCards(cards, emptyFilter()).map((item) => item.id)).toEqual(['active']);
    expect(
      selectCards(cards, { ...emptyFilter(), includeClosed: true }).map((item) => item.id),
    ).toEqual(['active', 'completed']);
  });

  it('intersects text words, lane, type, priority, and labels', () => {
    const matching: Card = {
      ...card('match', ['web']),
      title: 'LAN dashboard',
      owner: 'ct',
      state: 'claimed',
      lane: 'claimed',
      priority: 'p1',
    };
    const cards: Card[] = [
      matching,
      { ...matching, id: 'wrong-text', title: 'SSH tunnel' },
      { ...matching, id: 'wrong-lane', lane: 'pending' },
      { ...matching, id: 'wrong-type', type: 'epic' },
      { ...matching, id: 'wrong-priority', priority: 'p2' },
      { ...matching, id: 'wrong-label', labels: [] },
    ];
    const filter: ViewFilter = {
      ...emptyFilter(),
      query: '  LAN  CT dashboard ',
      lanes: ['claimed'],
      types: ['feature'],
      priorities: ['p1'],
      terms: { web: 'include' },
    };
    expect(selectCards(cards, filter).map((item) => item.id)).toEqual(['match']);
  });
});

describe('workspace navigation filters', () => {
  const cards: Card[] = [
    card('ready'),
    { ...card('progress'), state: 'claimed', lane: 'claimed' },
    { ...card('review'), state: 'in_review', lane: 'in_review' },
    { ...card('completed'), state: 'closed', lane: 'closed' },
  ];

  it.each([
    { view: 'all', expected: ['progress', 'ready', 'review'] },
    { view: 'progress', expected: ['progress'] },
    { view: 'review', expected: ['review'] },
    { view: 'completed', expected: ['completed'] },
  ] satisfies { view: WorkspaceView; expected: string[] }[])(
    '$view selects its issues and only its navigation button',
    ({ view, expected }) => {
      const filter = workspaceFilter(view);
      expect(selectCards(cards, filter).map((item) => item.id)).toEqual(expected);
      const views: WorkspaceView[] = ['all', 'progress', 'review', 'completed'];
      expect(views.filter((candidate) => matchesWorkspaceView(filter, candidate))).toEqual([view]);
    },
  );

  it.each([
    { query: 'search' },
    { terms: { web: 'include' } },
    { types: ['epic'] },
    { priorities: ['p1'] },
    { lanes: ['claimed', 'in_review'] },
    { includeClosed: true },
  ] satisfies Partial<ViewFilter>[])(
    'does not mark a modified preset as selected: %j',
    (change) => {
      expect(matchesWorkspaceView({ ...workspaceFilter('progress'), ...change }, 'progress')).toBe(
        false,
      );
    },
  );
});

describe('all-weaver overview cards', () => {
  it('shows only open in-progress/review/production cards in priority order', () => {
    const cards: Card[] = [
      card('ready'),
      { ...card('idea'), lane: 'refinement' },
      { ...card('progress'), lane: 'claimed', priority: 'p3' },
      { ...card('review'), lane: 'in_review', priority: 'p1' },
      { ...card('production'), lane: 'in_production' },
      { ...card('production-closed'), lane: 'in_production', state: 'closed' },
      { ...card('closed'), lane: 'claimed', state: 'closed' },
      { ...card('unknown'), lane: 'unknown' },
    ];
    expect(overviewCards(cards).map((item) => item.id)).toEqual([
      'review',
      'production',
      'progress',
    ]);
  });
});

describe('optional board lanes', () => {
  const cards: Card[] = [
    card('ready'),
    { ...card('production'), lane: 'in_production' },
    { ...card('other'), lane: 'unknown' },
  ];

  it('places populated production after review and keeps completed opt-in', () => {
    expect(selectBoardLanes(cards, false).map((lane) => lane.id)).toEqual([
      'refinement',
      'pending',
      'claimed',
      'in_review',
      'in_production',
      'unknown',
    ]);
    expect(selectBoardLanes(cards, true).map((lane) => lane.id)).toContain('closed');
  });

  it('hides optional lanes without matching cards, including on older spools', () => {
    const visible = selectCards(cards, { ...emptyFilter(), lanes: ['pending'] });
    expect(selectBoardLanes(visible, false).map((lane) => lane.id)).toEqual([
      'refinement',
      'pending',
      'claimed',
      'in_review',
    ]);
    expect(selectBoardLanes([], false)).toEqual(selectBoardLanes(visible, false));
    expect(
      selectCards(cards, { ...emptyFilter(), lanes: ['in_production'] }).map((item) => item.id),
    ).toEqual(['production']);
  });
});

describe('outline context', () => {
  const epic: Card = { ...card('epic'), type: 'epic' };
  const child: Card = { ...card('child', ['web']), epicId: epic.id };

  it('retains an unmatched epic as context for a matching feature', () => {
    const all: Card[] = [epic, child, { ...card('unrelated'), type: 'epic' }];
    const visible = selectCards(all, { ...emptyFilter(), terms: { web: 'include' } });
    expect(selectOutline(all, visible)).toEqual([{ parent: epic, cards: [child], context: true }]);
  });

  it('does not reveal unmatched children when only the epic matches', () => {
    const visible = selectCards([epic, child], { ...emptyFilter(), types: ['epic'] });
    expect(selectOutline([epic, child], visible)).toEqual([
      { parent: epic, cards: [], context: false },
    ]);
  });

  it('shows matched parents, children, and loose features exactly once', () => {
    const loose = card('loose');
    const orphan: Card = { ...card('orphan'), epicId: 'missing-epic' };
    const all = [epic, child, loose, orphan];
    expect(selectOutline(all, selectCards(all, emptyFilter()))).toEqual([
      { parent: epic, cards: [child], context: false },
      { parent: null, cards: [loose, orphan], context: false },
    ]);
  });
});

it('shares filtered membership across columns, outline and graph while retaining parent context', () => {
  const parent: Card = { ...card('parent'), type: 'epic' };
  const production: Card = {
    ...card('production', ['web']),
    epicId: parent.id,
    lane: 'in_production',
  };
  const completed: Card = { ...card('completed', ['web']), state: 'closed', lane: 'closed' };
  const all = [parent, production, completed];
  const filter: ViewFilter = { ...emptyFilter(), terms: { web: 'include' } };
  const model = issueSurfaceContent(all, filter);
  expect(model.allCards).toBe(all);
  expect(model.cards).toEqual([production]);
  expect(model.columns.flatMap((column) => column.items)).toEqual([{ card: production, parent }]);
  expect(model.outline).toEqual([{ parent, cards: [production], context: true }]);
  const withClosed = issueSurfaceContent(all, { ...filter, includeClosed: true });
  expect(withClosed.columns.find(({ lane }) => lane.id === 'closed')?.items).toEqual([
    { card: completed, parent: null },
  ]);
  const moved = issueSurfaceContent([parent, { ...production, lane: 'pending' }, completed], {
    ...filter,
    lanes: ['in_production'],
  });
  expect(moved.cards).toEqual([]);
  expect(moved.columns.some(({ lane }) => lane.id === 'in_production')).toBe(false);
});

describe('completed history prototypes', () => {
  function done(id: string, updatedAt: string | null): Card {
    return { ...card(id), state: 'closed', lane: 'closed', outcome: 'done', updatedAt };
  }

  it('sorts done cards by update, not creation or priority, and leaves unknown dates last', () => {
    const older = { ...done('older', '2026-09-18 10:00:00'), priority: 'p1' as const };
    const newer = { ...done('newer', '2026-09-19 10:00:00'), priority: 'p4' as const };
    const cards = [
      older,
      done('unknown', null),
      newer,
      { ...done('abandoned', null), outcome: 'abandoned' },
      { ...done('unactioned', null), outcome: 'unactioned' },
      { ...done('unknown-outcome', null), outcome: null },
      { ...done('reopened', null), state: 'active' },
    ];
    expect(completedHistory(cards, '').map(({ card: item }) => item.id)).toEqual([
      'newer',
      'older',
      'unknown',
    ]);
    expect(cards[0]).toBe(older);
    expect(
      completedHistory([done('b', null), done('a', null)], '').map(({ card: item }) => item.id),
    ).toEqual(['a', 'b']);
  });

  it('keeps parent context, filters by search, and separates feature and epic recap totals', () => {
    const parent = { ...done('epic', '2026-09-18 10:00:00'), type: 'epic' as const };
    const feature = {
      ...done('feature', '2026-09-18 11:00:00'),
      epicId: 'epic',
      owner: 'falcon',
      labels: ['ui'],
    };
    const entries = completedHistory([parent, feature, done('unknown', null)], '');
    const day = historyDateKey(new Date('2026-09-18T10:00:00Z'));
    expect(entries[0]?.parent).toEqual(parent);
    expect(
      completedHistory([parent, feature], 'UI falcon').map(({ card: item }) => item.id),
    ).toEqual(['feature']);
    expect(completedRecap(entries, day)).toMatchObject({ features: 1, epics: 1, owners: 1 });
    expect(completedRecap(entries, '2025-01-01').entries).toEqual([]);
    expect(completedDays(entries).map((group) => [group.day, group.entries.length])).toEqual([
      [day, 2],
      [null, 1],
    ]);
  });

  it('interprets SQLite timestamps as UTC and preserves zoned instants', () => {
    const instant = Date.parse('2026-09-18T23:30:00Z');
    expect(historyTimestamp('2026-09-18 23:30:00')).toBe(instant);
    expect(historyTimestamp('2026-09-19T01:30:00+02:00')).toBe(instant);
    expect(historyTimestamp(null)).toBeNull();
    expect(historyTimestamp('invalid')).toBeNull();
    const entries = completedHistory([done('midnight', '2026-09-18 23:30:00')], '');
    expect(entries[0]?.day).toBe(historyDateKey(new Date(instant)));
  });

  it.each([
    ['2026-01-01', -1, '2025-12-31'],
    ['2024-03-01', -1, '2024-02-29'],
    ['2026-03-08', 1, '2026-03-09'],
    ['2026-11-01', 1, '2026-11-02'],
  ])('moves calendar days across boundaries: %s', (day, offset, expected) => {
    expect(shiftHistoryDay(day, offset)).toBe(expected);
  });
});
