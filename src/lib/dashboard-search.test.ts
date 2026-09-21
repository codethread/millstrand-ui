import { describe, expect, it } from 'vitest';
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import {
  allGraphCardsSearch,
  manualFilterSearch,
  parseDashboardSearch,
  pinnableWorkspaceId,
  savedViewSearch,
  workspaceActivityDestination,
  workspaceDestination,
  workspaceViewSearch,
} from './dashboard-search';

describe('shareable dashboard navigation', () => {
  it('keeps cross-weaver inspector selection on the overview', () => {
    const state = parseDashboardSearch({
      mode: 'overview',
      workspace: 'weaver-b',
      issue: 'card-b',
    });
    expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(state)))).toEqual(state);
    expect(state).toMatchObject({
      mode: 'overview',
      workspace: 'weaver-b',
      issue: 'card-b',
    });
  });
  it('preserves the production lane in shared filters after a URL round trip', () => {
    const state = parseDashboardSearch({ filter: { lanes: ['in_production'] } });
    expect(state.filter.lanes).toEqual(['in_production']);
    expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(state)))).toEqual(state);
  });

  it('preserves the exact agent run destination without requiring an identity', () => {
    const state = parseDashboardSearch({
      mode: 'agents',
      workspace: 'weaver-a',
      agent: null,
      agentRun: 'run-a',
    });
    expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(state)))).toEqual(state);
    expect(parseDashboardSearch({ issue: 'card-a', agentRun: 'run-a' })).toMatchObject({
      mode: 'agents',
      issue: null,
      agentRun: 'run-a',
    });
    expect(workspaceDestination('weaver-b', { kind: 'card', id: 'card-b' }).agentRun).toBeNull();
  });
  it('opens the overview at home and a dashboard for workspace/item links', () => {
    expect(parseDashboardSearch({}).mode).toBe('overview');
    expect(parseDashboardSearch({ workspace: 'weaver-a' }).mode).toBe('board');
    expect(parseDashboardSearch({ issue: 'card-a' }).mode).toBe('board');
  });

  it('keeps an undiscovered/offline configured default unscoped instead of breaking its API requests', () => {
    const workspace = { id: 'default', name: 'Default', path: '/default/.millstrand' };
    expect(pinnableWorkspaceId([{ ...workspace, status: 'offline' }], workspace.path)).toBeNull();
    expect(pinnableWorkspaceId([], workspace.path)).toBeNull();
    expect(pinnableWorkspaceId([{ ...workspace, status: 'running' }], workspace.path)).toBe(
      'default',
    );
    expect(pinnableWorkspaceId([{ ...workspace, status: 'running' }], null)).toBeNull();
  });

  it('round trips a full dashboard through the router URL codec', () => {
    const state = parseDashboardSearch({
      mode: 'graph',
      workspace: 'weaver-a',
      issue: 'card-a',
      detailTab: 'agents',
      graphRoot: 'root-a',
      activeViewId: 'my-view',
      agentQuery: 'sol high',
      activeAgentsOnly: true,
      filter: {
        query: 'LAN & links / 日本語',
        mode: 'or',
        terms: { web: 'include', archived: 'exclude' },
        lanes: ['claimed', 'in_review'],
        types: ['feature'],
        priorities: ['p1', 'p3'],
        includeClosed: true,
      },
    });
    expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(state)))).toEqual(state);
  });

  it('normalizes malformed URL fields independently and gives agent selection precedence', () => {
    const state = parseDashboardSearch({
      mode: 'bogus',
      workspace: 2,
      issue: 'card',
      agent: 'identity',
      detailTab: 'bogus',
      graphRoot: [],
      activeAgentsOnly: 'true',
      filter: {
        query: 99,
        lanes: ['claimed', 'invalid', 'claimed'],
        types: ['task'],
        priorities: ['p1', 'p9'],
        includeClosed: 'false',
        terms: { good: 'exclude', invalid: 10 },
      },
    });
    expect(state).toMatchObject({
      mode: 'agents',
      workspace: null,
      issue: null,
      agent: 'identity',
      detailTab: 'overview',
      graphRoot: null,
      activeAgentsOnly: false,
      filter: {
        query: '',
        mode: 'and',
        lanes: ['claimed'],
        types: [],
        priorities: ['p1'],
        includeClosed: false,
        terms: { good: 'exclude' },
      },
    });
    expect(parseDashboardSearch({ filter: ['bad'] }).filter).toEqual(
      parseDashboardSearch({}).filter,
    );
  });

  it('clears saved-view identity when its filter snapshot is changed manually', () => {
    const search = parseDashboardSearch({
      mode: 'graph',
      activeViewId: 'saved-view',
      graphRoot: 'card-a',
    });
    const filter = { ...search.filter, query: 'manual change' };

    expect(manualFilterSearch(search, filter)).toEqual({
      filter,
      activeViewId: null,
      graphRoot: null,
      graphDependencies: [],
      mode: 'graph',
    });
  });

  it('installs saved and built-in view snapshots without retaining surface-only state', () => {
    const search = parseDashboardSearch({
      mode: 'reviews',
      activeViewId: 'old-view',
      graphRoot: 'old-root',
    });
    const filter = { ...search.filter, query: 'platform' };

    expect(savedViewSearch(search, { id: 'platform', name: 'Platform', filter })).toEqual({
      filter,
      activeViewId: 'platform',
      graphRoot: null,
      graphDependencies: [],
      mode: 'board',
    });
    expect(workspaceViewSearch({ ...search, mode: 'agents' }, 'review')).toMatchObject({
      activeViewId: null,
      graphRoot: null,
      graphDependencies: [],
      mode: 'board',
      filter: { lanes: ['in_review'] },
    });
  });

  it('does not offer explicit routes into offline last-known activity', () => {
    const workspace = {
      id: 'weaver-a',
      name: 'Weaver A',
      path: '/work/a/.millstrand',
      status: 'offline' as const,
    };

    expect(workspaceActivityDestination(workspace, { kind: 'board' })).toBeNull();
    expect(
      workspaceActivityDestination(
        { ...workspace, status: 'running' },
        {
          kind: 'card',
          id: 'card-a',
        },
      ),
    ).toMatchObject({ workspace: 'weaver-a', issue: 'card-a' });
  });

  it('scopes same-named items to their own weaver and starts without stale filters', () => {
    const card = workspaceDestination('weaver-a', { kind: 'card', id: 'same-id' });
    const agent = workspaceDestination('weaver-b', { kind: 'agent', id: 'same-id' });
    expect(card).toMatchObject({
      workspace: 'weaver-a',
      mode: 'board',
      issue: 'same-id',
      agent: null,
      activeViewId: null,
      graphRoot: null,
    });
    expect(agent).toMatchObject({
      workspace: 'weaver-b',
      mode: 'agents',
      issue: null,
      agent: 'same-id',
      activeAgentsOnly: true,
    });
    expect(card.filter).toEqual(parseDashboardSearch({}).filter);
    expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(agent)))).toEqual(agent);
  });
});

it('round trips completed layouts, selected day, search and issue independently of board filters', () => {
  const state = parseDashboardSearch({
    mode: 'completed',
    historyLayout: 'recap',
    historyDay: '2026-09-18',
    historyQuery: 'web',
    issue: 'done-card',
    filter: { lanes: ['claimed'] },
  });
  expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(state)))).toEqual(state);
  expect(parseDashboardSearch({ historyDay: '2026-02-30', historyLayout: 'bad' })).toMatchObject({
    historyDay: null,
    historyLayout: 'timeline',
  });
  expect(workspaceViewSearch(state, 'all').mode).toBe('board');
  expect(workspaceViewSearch(state, 'completed')).toMatchObject({ mode: 'completed', issue: null });
  expect(savedViewSearch(state, null).mode).toBe('board');
});

it('keeps completed filters on the history surface and rejects removed layouts', () => {
  const state = parseDashboardSearch({
    mode: 'completed',
    historyLayout: 'recap',
    historyDay: '2026-09-18',
    historyQuery: 'dashboard',
  });
  const updated = {
    ...state,
    ...manualFilterSearch(state, {
      ...state.filter,
      types: ['feature'],
      priorities: ['p1'],
      terms: { web: 'include' },
    }),
  };
  expect(updated).toMatchObject({
    mode: 'completed',
    historyLayout: 'recap',
    historyQuery: 'dashboard',
    historyDay: '2026-09-18',
    filter: { types: ['feature'], priorities: ['p1'], terms: { web: 'include' } },
  });
  expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(updated)))).toEqual(
    updated,
  );
  expect(parseDashboardSearch({ historyLayout: 'ledger' }).historyLayout).toBe('timeline');
});

it('round trips unique expanded IDs and rejects the removed dependency mode', () => {
  const state = parseDashboardSearch({ mode: 'graph', graphDependencies: ['a', 'b', 'a'] });
  expect(state.graphDependencies).toEqual(['a', 'b']);
  expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(state)))).toEqual(state);
  expect(manualFilterSearch(state, state.filter).graphDependencies).toEqual([]);
  expect(
    parseDashboardSearch({ graphDependencies: { kind: 'focus', id: 'a' } }).graphDependencies,
  ).toEqual([]);
});

it('shows all graph cards by clearing scope and filters but retaining completed visibility', () => {
  const search = parseDashboardSearch({
    graphRoot: 'feature',
    graphDependencies: ['outside'],
    activeViewId: 'saved',
    filter: { query: 'narrow', lanes: ['claimed'], terms: { web: 'include' }, includeClosed: true },
  });
  expect(allGraphCardsSearch(search)).toEqual({
    graphRoot: null,
    graphDependencies: [],
    activeViewId: null,
    filter: { ...parseDashboardSearch({}).filter, includeClosed: true },
  });
});
