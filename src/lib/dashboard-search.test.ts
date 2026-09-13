import { describe, expect, it } from 'vitest';
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { parseDashboardSearch, workspaceDestination } from './dashboard-search';

describe('shareable dashboard navigation', () => {
  it('opens the overview at home and a dashboard for workspace/item links', () => {
    expect(parseDashboardSearch({}).mode).toBe('overview');
    expect(parseDashboardSearch({ workspace: 'weaver-a' }).mode).toBe('board');
    expect(parseDashboardSearch({ issue: 'card-a' }).mode).toBe('board');
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
