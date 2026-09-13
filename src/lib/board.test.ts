import { describe, expect, it } from 'vitest';
import type { Card, ViewFilter } from '../../shared/api';
import { overviewCards } from './overview';
import {
  emptyFilter,
  matchesWorkspaceView,
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
    createdAt: '2026-09-12 10:00:00',
    updatedAt: null,
  };
}

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
  it('shows only open in-progress/review cards in priority order', () => {
    const cards: Card[] = [
      card('ready'),
      { ...card('idea'), lane: 'refinement' },
      { ...card('progress'), lane: 'claimed', priority: 'p3' },
      { ...card('review'), lane: 'in_review', priority: 'p1' },
      { ...card('closed'), lane: 'claimed', state: 'closed' },
      { ...card('unknown'), lane: 'unknown' },
    ];
    expect(overviewCards(cards).map((item) => item.id)).toEqual(['review', 'progress']);
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
