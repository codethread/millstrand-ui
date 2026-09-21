import { describe, expect, it } from 'vitest';
import { launchRefusalMessage, parseLaunchRefusals } from './launch-readiness.ts';

const row = (change: Partial<Record<string, string | null>> = {}) => ({
  target_id: 'card1',
  target_state: 'active',
  target_lane: 'pending',
  blocker_id: null,
  blocker_lane: null,
  ...change,
});

function refusal(rows: Record<string, string | null>[]) {
  return parseLaunchRefusals(rows).get('card1') ?? null;
}

describe('launch refusals from persisted rows', () => {
  it('admits an active strand with no active blockers, including one without a card lane', () => {
    expect(refusal([row()])).toBeNull();
    expect(refusal([row({ target_lane: null })])).toBeNull();
    expect(refusal([row({ target_lane: 'claimed' })])).toBeNull();
  });

  it('refuses a missing target, refinement admission and closed or replaced targets', () => {
    expect(refusal([row({ target_state: null, target_lane: null })])).toEqual({ kind: 'missing' });
    expect(refusal([row({ target_lane: 'refinement' })])).toEqual({ kind: 'refinement' });
    expect(refusal([row({ target_state: 'closed', target_lane: null })])).toEqual({
      kind: 'closed',
      state: 'closed',
    });
    expect(refusal([row({ target_state: 'replaced', target_lane: null })])).toEqual({
      kind: 'closed',
      state: 'replaced',
    });
  });

  it('groups blocker rows, orders them by id, keeps lanes explicit and blocks ahead of refinement', () => {
    const refusals = parseLaunchRefusals([
      row({ target_lane: 'refinement', blocker_id: 'dep2', blocker_lane: null }),
      row({ target_lane: 'refinement', blocker_id: 'dep1', blocker_lane: 'refinement' }),
      row({ target_lane: 'refinement', blocker_id: 'dep3', blocker_lane: 'elsewhere' }),
      row({ target_id: 'ready', target_lane: null }),
    ]);
    // Active dependencies are the Harnesses-level constraint, so they outrank the
    // refinement admission rule; a ready target is omitted entirely.
    expect([...refusals]).toEqual([
      [
        'card1',
        {
          kind: 'blocked',
          blockers: [
            { id: 'dep1', lane: 'refinement' },
            { id: 'dep2', lane: null },
            { id: 'dep3', lane: 'unknown' },
          ],
        },
      ],
    ]);
  });

  it('fails loudly on malformed rows instead of guessing admission', () => {
    expect(() => parseLaunchRefusals([row({ target_state: 'paused' })])).toThrow(
      'launch refusal rows are invalid',
    );
  });
});

describe('launch refusal messages', () => {
  it('names the blockers and lanes of a refused pending card', () => {
    expect(
      launchRefusalMessage('card1', {
        kind: 'blocked',
        blockers: [
          { id: 'dep1', lane: 'refinement' },
          { id: 'dep2', lane: null },
        ],
      }),
    ).toMatch(/dep1 \(refinement\), dep2\b/);
  });

  it('gives the promotion action for refinement and never claims a run was sent', () => {
    const message = launchRefusalMessage('v5bz2', { kind: 'refinement' });
    expect(message).toContain('still in refinement');
    expect(message).toContain('strand update v5bz2 --attr kanban/lane=pending');
    expect(message).toContain('was not sent');
  });

  it.each([
    [{ kind: 'missing' } as const, 'not in this weaver'],
    [{ kind: 'closed' as const, state: 'closed' as const }, 'is closed'],
    [{ kind: 'closed' as const, state: 'replaced' as const }, 'is replaced'],
  ])('explains an unlaunchable target: %j', (value, expected) => {
    expect(launchRefusalMessage('t1', value)).toContain(expected);
  });
});
