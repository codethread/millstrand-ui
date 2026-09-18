import { describe, expect, it } from 'vitest';
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import {
  manualFilterSearch,
  parseDashboardSearch,
  pinnableWorkspaceId,
  savedViewSearch,
  workspaceActivityDestination,
  workspaceDestination,
  workspaceViewSearch,
} from './dashboard-search';

describe('shareable dashboard navigation', () => {
  it('preserves the production lane in shared filters after a URL round trip', () => {
    const state = parseDashboardSearch({ filter: { lanes: ['in_production'] } });
    expect(state.filter.lanes).toEqual(['in_production']);
    expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(state)))).toEqual(state);
  });

  it('preserves the exact agent run destination and clears it when opening a card', () => {
    const state = parseDashboardSearch({
      mode: 'agents',
      workspace: 'weaver-a',
      agent: 'tiger',
      agentRun: 'run-a',
    });
    expect(parseDashboardSearch(defaultParseSearch(defaultStringifySearch(state)))).toEqual(state);
    expect(parseDashboardSearch({ issue: 'card-a', agentRun: 'run-a' }).agentRun).toBeNull();
    expect(workspaceDestination('weaver-b', { kind: 'card', id: 'card-b' }).agentRun).toBeNull();
  });
  it('opens the overview with active agents only and a dashboard for workspace/item links', () => {
    expect(parseDashboardSearch({})).toMatchObject({
      mode: 'overview',
      activeAgentsOnly: true,
    });
    expect(parseDashboardSearch({ activeAgentsOnly: false }).activeAgentsOnly).toBe(false);
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
      detailTab: 'activity',
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
      mode: 'board',
      workspace: null,
      issue: null,
      agent: 'identity',
      detailTab: 'overview',
      graphRoot: null,
      activeAgentsOnly: true,
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
      mode: 'board',
    });
    expect(workspaceViewSearch({ ...search, mode: 'agents' }, 'review')).toMatchObject({
      activeViewId: null,
      graphRoot: null,
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
