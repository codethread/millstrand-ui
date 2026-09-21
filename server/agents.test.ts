import { describe, expect, it } from 'vitest';
import { parseAgents } from './agents.ts';

function strand(
  id: string,
  attributes: Record<string, unknown>,
  createdAt = '2026-09-13 10:00:00',
) {
  return {
    id,
    title: id,
    state: 'active',
    created_at: createdAt,
    updated_at: createdAt,
    attributes,
  };
}
function edge(from: string, to: string, edgeType: string) {
  return { from_strand_id: from, to_strand_id: to, edge_type: edgeType };
}
function identity(id: string, friendly: string) {
  return strand(id, {
    'identity/session': 'true',
    'identity/id': friendly,
    'identity/harness': 'pi',
  });
}
const runAttrs = {
  'harness/run': 'true',
  'harness/published': 'true',
  'identity/id': 'latest-worker',
  'harness/alias': 'luna-high',
  'harness/harness': 'pi',
  'harness/status': 'running',
  'harness/mode': 'headless',
  'harness/model': 'test-model',
};

describe('agent directory boundary', () => {
  it('uses performed and serving edges for all historical participants instead of scalar snapshots', () => {
    const result = parseAgents({
      strands: [
        identity('identity-a', 'worker-a'),
        identity('identity-b', 'worker-b'),
        strand('run1', {
          ...runAttrs,
          'harness/target': 'stale-target',
          'harness/root-targets': ['stale-root'],
          'harness/env': { TOKEN: 'secret-value' },
        }),
      ],
      edges: [
        edge('identity-a', 'run1', 'performed'),
        edge('identity-b', 'run1', 'performed'),
        edge('run1', 'task1', 'serves'),
        edge('run1', 'card1', 'serves-root'),
      ],
    });

    expect(result.runs).toMatchObject([
      {
        id: 'run1',
        target: 'task1',
        rootTargets: ['card1'],
        participants: [
          { identity: 'worker-a', status: 'resolved', identityStrandIds: ['identity-a'] },
          { identity: 'worker-b', status: 'resolved', identityStrandIds: ['identity-b'] },
        ],
      },
    ]);
    expect(result.identities.map((candidate) => candidate.runs.map((run) => run.id))).toEqual([
      ['run1'],
      ['run1'],
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(JSON.stringify(result)).not.toContain('stale-target');
  });

  it('links a workflow-gate reviewer only to a feature in the same workspace snapshot', () => {
    const strands = [
      strand('feature', { 'kanban/card': 'true' }),
      identity('reviewer-identity', 'gentle-ready-fox'),
      strand('land-root', {
        'workflow/form': 'molecule',
        'workflow/role': 'root',
        'workflow/run-id': 'land-auto-feature',
        'workflow/context': { card: 'feature', feature: 'feature' },
      }),
      strand('review-gate', {
        'workflow/form': 'molecule',
        'workflow/role': 'step',
        'review/role': 'reviewer',
      }),
      strand('review-run', { ...runAttrs, 'harness/alias': 'reviewer' }),
    ];
    const edges = [
      edge('land-root', 'review-gate', 'parent-of'),
      edge('reviewer-identity', 'review-run', 'performed'),
      edge('review-run', 'review-gate', 'serves'),
    ];
    const result = parseAgents({ strands, edges });

    expect(result.runs[0]).toMatchObject({
      id: 'review-run',
      target: 'review-gate',
      rootTargets: [],
      workflow: {
        rootId: 'land-root',
        runId: 'land-auto-feature',
        cardId: 'feature',
        role: 'reviewer',
      },
    });
    expect(
      parseAgents({ strands: strands.filter(({ id }) => id !== 'feature'), edges }).runs[0]
        ?.workflow,
    ).toBeNull();
  });

  it('keeps native resume and fresh retry provenance distinct', () => {
    const result = parseAgents({
      strands: [
        identity('identity-a', 'worker-a'),
        strand('original', { ...runAttrs, 'harness/status': 'stopped' }),
        strand('resumed', runAttrs, '2026-09-14 10:00:00'),
        strand('fresh', { ...runAttrs, 'harness/status': 'ready' }, '2026-09-15 10:00:00'),
      ],
      edges: [
        edge('identity-a', 'original', 'performed'),
        edge('identity-a', 'resumed', 'performed'),
        edge('identity-a', 'fresh', 'performed'),
        edge('resumed', 'original', 'resumes'),
        edge('fresh', 'resumed', 'continues'),
      ],
    });

    expect(result.runs.map(({ id, continuation }) => ({ id, continuation }))).toEqual([
      {
        id: 'fresh',
        continuation: { kind: 'fresh-retry', predecessorRunId: 'resumed' },
      },
      {
        id: 'resumed',
        continuation: { kind: 'native-resume', predecessorRunId: 'original' },
      },
      { id: 'original', continuation: null },
    ]);
  });

  it('returns unresolved run provenance without inventing an identity record', () => {
    const result = parseAgents({ strands: [strand('run', runAttrs)], edges: [] });
    expect(result.identities).toEqual([]);
    expect(result.runs[0]?.participants).toEqual([
      { identity: 'latest-worker', status: 'unresolved', identityStrandIds: [] },
    ]);
  });

  it('rejects unsupported graph shapes instead of selecting a conflicting identity', () => {
    expect(() =>
      parseAgents({
        strands: [identity('identity-a', 'worker-a'), strand('run', runAttrs)],
        edges: [edge('run', 'task-a', 'serves'), edge('run', 'task-b', 'serves')],
      }),
    ).toThrow('serves multiple direct targets');
  });
});
