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
    attributes: Object.fromEntries(
      Object.entries(attributes).filter(([, value]) => value !== undefined),
    ),
  };
}
const identity = strand('identity1', {
  'identity/session': 'true',
  'identity/id': 'calm-young-tiger',
  'identity/harness': 'pi',
});
const runAttrs = {
  'harness/run': 'true',
  'harness/published': 'true',
  'identity/id': 'calm-young-tiger',
  'harness/alias': 'luna-high',
  'harness/harness': 'pi',
  'harness/status': 'running',
  'harness/mode': 'headless',
  'harness/model': 'test-model',
};

describe('agent directory boundary', () => {
  it('joins friendly ownership and tracked run aliases without exposing provider secrets', () => {
    const agents = parseAgents([
      identity,
      strand('run1', {
        ...runAttrs,
        'harness/target': 'card1',
        'harness/root-targets': ['epic1'],
        'harness/env': { TOKEN: 'secret-value' },
        'harness/prompt': { 'millstrand/omitted': true, bytes: 9999 },
      }),
      strand('card1', { owner: 'calm-young-tiger', 'kanban/card': 'true' }),
      strand('task1', { owner: 'calm-young-tiger', 'kanban/task': 'true' }),
      strand('other', { owner: 'pi', 'kanban/card': 'true' }),
    ]);
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: 'calm-young-tiger',
      harness: 'pi',
      runs: [{ alias: 'luna-high', status: 'running', target: 'card1', rootTargets: ['epic1'] }],
      work: [
        { id: 'card1', kind: 'card' },
        { id: 'task1', kind: 'task' },
      ],
    });
    expect(JSON.stringify(agents)).not.toContain('secret-value');
    expect(JSON.stringify(agents)).not.toContain('harness/prompt');
  });

  it('retains run history newest first, excludes unpublished runs, and does not infer status from strand state', () => {
    const [agent] = parseAgents([
      identity,
      strand('old', { ...runAttrs, 'harness/status': 'stopped', 'harness/substatus': 'completed' }),
      strand('new', { ...runAttrs, 'harness/status': 'ready' }, '2026-09-14 10:00:00'),
      strand('partial', { 'harness/run': 'true' }),
    ]);
    expect(agent?.runs.map((run) => [run.id, run.status])).toEqual([
      ['new', 'ready'],
      ['old', 'stopped'],
    ]);
    expect(() =>
      parseAgents([identity, strand('invalid', { ...runAttrs, 'harness/status': null })]),
    ).toThrow('harness/status');
  });

  it('supports identities without tracked runs and worlds without identities', () => {
    expect(parseAgents([identity])[0]).toMatchObject({ runs: [], work: [] });
    expect(parseAgents([])).toEqual([]);
    expect(parseAgents([strand('card', { 'kanban/card': 'true' })])).toEqual([]);
  });

  it.each([undefined, null])(
    'retains linked runs and owned work when a historical run has identity %s',
    (identityId) => {
      const unlinkedRun = strand('historical', {
        ...runAttrs,
        'identity/id': identityId,
        owner: 'calm-young-tiger',
      });
      const agents = parseAgents([unlinkedRun, identity, strand('linked', runAttrs)]);

      expect(agents).toHaveLength(1);
      expect(agents[0]?.runs.map((run) => run.id)).toEqual(['linked']);
      expect(agents[0]?.work).toEqual([
        { id: 'historical', title: 'historical', state: 'active', kind: 'work' },
      ]);
      expect(parseAgents([unlinkedRun])).toEqual([]);
    },
  );

  it('rejects malformed identity linkage instead of silently assigning the wrong alias', () => {
    expect(() =>
      parseAgents([identity, strand('broken', { ...runAttrs, 'identity/id': 42 })]),
    ).toThrow('identity/id');
  });
});
