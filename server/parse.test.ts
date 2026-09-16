import { describe, expect, it } from 'vitest';
import {
  parseCard,
  parseGraph,
  parseLabelChange,
  parseRelation,
  parseTask,
  parseViews,
  parseWork,
  strandErrorMessage,
} from './parse.ts';

const entity = {
  id: 'abc12',
  title: 'Dashboard',
  state: 'active',
  attributes: { 'kanban/card': 'true' },
};

describe('strand projection boundaries', () => {
  it.each([{ lane: 'in_production' }, { attributes: { 'kanban/lane': 'in_production' } }])(
    'preserves production cards in compact and raw projections: %j',
    (projection) => {
      const card = { ...entity, ...projection, created_at: '2026-09-12 10:00:00' };
      expect(parseCard(card).lane).toBe('in_production');
      expect(parseCard({ ...card, state: 'closed' }).lane).toBe('closed');
    },
  );

  it('preserves production filters when loading saved views', () => {
    const view = {
      id: 'production',
      name: 'Production observation',
      filter: {
        query: '',
        mode: 'and',
        terms: {},
        lanes: ['in_production'],
        types: [],
        priorities: [],
        includeClosed: false,
      },
    };
    expect(parseViews([view])).toEqual([view]);
  });

  it('uses the documented type and priority defaults in legacy raw card details', () => {
    expect(parseCard({ ...entity, created_at: '2026-09-12 10:00:00' })).toMatchObject({
      type: 'feature',
      priority: 'p3',
      lane: 'unknown',
      labels: [],
    });
  });

  it('allows additive card fields but fails loudly when a known field changes type', () => {
    expect(
      parseCard({
        ...entity,
        lane: 'future-lane',
        created_at: '2026-09-12 10:00:00',
        futureProjection: { version: 2 },
      }).lane,
    ).toBe('unknown');
    expect(() => parseCard({ ...entity, lane: 42, created_at: '2026-09-12 10:00:00' })).toThrow(
      'lane',
    );
  });

  it('accepts timestamp-free entity projections in active work and related dependencies', () => {
    expect(parseWork(entity)).toMatchObject({ createdAt: null, updatedAt: null });
    expect(parseRelation({ relation: 'depended-on-by', strand: entity })).toEqual({
      kind: 'depended-on-by',
      item: { ...entity, createdAt: null, updatedAt: null },
    });
  });

  it('keeps hierarchy and dependency direction distinct and recognizes legacy feature nodes', () => {
    const child = { ...entity, id: 'task1', attributes: { 'kanban/task': 'true' } };
    const dependency = { ...child, id: 'task2' };
    const graph = parseGraph({
      'root-id': entity.id,
      strands: [entity, child, dependency],
      'parent-of-edges': [{ from_strand_id: entity.id, to_strand_id: child.id }],
      'depends-on-edges': [{ from_strand_id: child.id, to_strand_id: dependency.id }],
    });
    expect(graph.nodes.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'abc12', kind: 'feature' },
      { id: 'task1', kind: 'task' },
      { id: 'task2', kind: 'task' },
    ]);
    expect(graph.edges).toEqual([
      { kind: 'parent-of', from: 'abc12', to: 'task1' },
      { kind: 'depends-on', from: 'task1', to: 'task2' },
    ]);
  });

  it('reads labels exactly as the spool does and keeps a closed lifecycle above stale lane data', () => {
    const card = parseCard({
      ...entity,
      state: 'closed',
      created_at: '2026-09-12 10:00:00',
      attributes: {
        'kanban/card': 'true',
        'kanban/lane': 'claimed',
        'kanban.label/web': 'true',
        'kanban.label/removed': null,
        'kanban.label/not-a-string-flag': true,
      },
    });
    expect(card.labels).toEqual(['web']);
    expect(card.lane).toBe('closed');
  });

  it.each(['ready', 'doing', 'blocked', 'closed'] as const)(
    'preserves authoritative task status %s',
    (status) => {
      expect(
        parseTask({ id: 'task1', title: 'Build', state: 'active', status, owner: 'codex' }).status,
      ).toBe(status);
    },
  );
});

describe('workspace command failures', () => {
  it('explains an unavailable Kanban command while preserving unrelated missing-operation errors', () => {
    const envelope = {
      code: 'domain/error',
      message: 'Operation not found',
      details: { 'canonical-operation': 'kanban' },
    };
    expect(strandErrorMessage(JSON.stringify(envelope), 'original diagnostic')).toContain(
      'does not publish Kanban',
    );
    expect(
      strandErrorMessage(
        JSON.stringify({ ...envelope, details: { 'canonical-operation': 'notes' } }),
        'original diagnostic',
      ),
    ).toBe('original diagnostic');
  });

  it('explains the exact missing-workspace-configuration error', () => {
    expect(
      strandErrorMessage(
        JSON.stringify({
          code: 'mill/invoke-world-failed',
          message: 'invoke world resolution failed',
          details: {
            detail:
              'client config /work/project/.millstrand/config.json is required; run mill init for the selected world',
          },
        }),
        'original diagnostic',
      ),
    ).toContain('workspace configuration is unavailable');
  });

  it('keeps process-level diagnostics when no structured error was emitted', () => {
    expect(strandErrorMessage('command was terminated', 'original diagnostic')).toBe(
      'original diagnostic',
    );
  });
});

describe('label writes', () => {
  it('normalizes and deduplicates label slugs before passing positional arguments to strand', () => {
    expect(parseLabelChange({ action: 'add', labels: [' WEB ', 'web', 'api'] })).toEqual({
      action: 'add',
      labels: ['web', 'api'],
    });
  });

  it.each(['--state', 'foo/bar', 'two words', ''])(
    'rejects labels outside the spool grammar: %s',
    (value) => {
      expect(() => parseLabelChange({ action: 'add', labels: [value] })).toThrow(
        'Labels must contain',
      );
    },
  );
});
