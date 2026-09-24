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
  'harness/alias': 'luna-high',
  'harness/harness': 'pi',
  'harness/status': 'running',
  'harness/mode': 'headless',
  'harness/observed-model': 'test-model',
  'harness/observed-effort': 'high',
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

  it('keeps a pre-binding published run visible without inventing an actor', () => {
    const result = parseAgents({
      strands: [
        strand('run', {
          ...runAttrs,
          'identity/id': 'superseded-scalar',
          'harness/session-id': 'native-session',
        }),
      ],
      edges: [edge('run', 'task', 'serves')],
    });
    expect(result.identities).toEqual([]);
    expect(result.runs[0]).toMatchObject({
      id: 'run',
      target: 'task',
      participants: [],
      session: { provider: 'pi', session: 'native-session' },
    });
  });

  it('projects alias-less external sessions from observed values and explicit custody', () => {
    const result = parseAgents({
      strands: [
        identity('identity-direct', 'direct-agent'),
        strand('direct', {
          'harness/run': 'true',
          'harness/published': 'true',
          'harness/harness': 'codex',
          'harness/status': 'running',
          'harness/mode': 'external',
          'harness/ownership': 'external',
          'harness/session-id': 'thread-1',
          'harness/observed-model': 'gpt-native',
          'harness/observed-effort': 'unknown',
          // Compatibility launch values must not replace observed callback evidence.
          'harness/model': 'requested-model',
          'harness/effort': 'high',
        }),
      ],
      edges: [edge('identity-direct', 'direct', 'performed')],
    });
    expect(result.runs[0]).toMatchObject({
      alias: null,
      mode: 'external',
      model: 'gpt-native',
      effort: 'unknown',
      ownership: 'external',
      target: null,
      rootTargets: [],
      session: { provider: 'codex', session: 'thread-1' },
    });
  });

  it('rejects an external publication that omits explicit observed effort', () => {
    expect(() =>
      parseAgents({
        strands: [
          strand('direct', {
            'harness/run': 'true',
            'harness/published': 'true',
            'harness/harness': 'pi',
            'harness/status': 'running',
            'harness/mode': 'external',
            'harness/ownership': 'external',
            'harness/observed-model': 'pi/actual',
          }),
        ],
        edges: [],
      }),
    ).toThrow('lacks explicit observed effort');
  });

  it('keeps a model-less external Pi session explicit instead of using launch metadata', () => {
    const result = parseAgents({
      strands: [
        strand('direct', {
          'harness/run': 'true',
          'harness/published': 'true',
          'harness/harness': 'pi',
          'harness/status': 'running',
          'harness/mode': 'external',
          'harness/ownership': 'external',
          'harness/observed-effort': 'unknown',
          'harness/model': 'superseded-launch-value',
        }),
      ],
      edges: [],
    });
    expect(result.runs[0]).toMatchObject({
      model: null,
      effort: 'unknown',
      ownership: 'external',
    });
  });

  it('retains exact native parent identity edges', () => {
    const result = parseAgents({
      strands: [identity('parent', 'parent-agent'), identity('child', 'child-agent')],
      edges: [edge('parent', 'child', 'parent-of')],
    });
    expect(result.identities.find(({ strandId }) => strandId === 'child')).toMatchObject({
      parentIdentityStrandIds: ['parent'],
    });
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
