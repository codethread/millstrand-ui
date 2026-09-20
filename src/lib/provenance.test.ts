import { describe, expect, it } from 'vitest';
import type { CardOwnership, IdentityAttribution, OwnershipClaim } from '../../shared/api';
import { attributionLabel, orderedOwnershipHistory, priorOwnership } from './provenance';

function attribution(identity: string, status: IdentityAttribution['status'] = 'resolved') {
  return { identity, status, identityStrandIds: [] };
}

function claim(
  id: string,
  order: number,
  owner: string,
  status: IdentityAttribution['status'] = 'resolved',
): OwnershipClaim {
  return {
    id,
    owner: attribution(owner, status),
    actor: null,
    claimedAt: `2026-09-0${order}T12:00:00Z`,
    order,
    branch: null,
    worktree: null,
    runId: null,
  };
}

describe('durable ownership presentation', () => {
  it('keeps reporter separate and preserves A→B→A claims in authoritative order', () => {
    const first = claim('first', 1, 'a');
    const second = claim('second', 2, 'b');
    const third = claim('third', 3, 'a');
    const ownership: CardOwnership = { current: third, history: [third, first, second] };
    expect(attributionLabel(attribution('reporter'))).toBe('reporter');
    expect(orderedOwnershipHistory(ownership).map((item) => item.owner.identity)).toEqual([
      'a',
      'b',
      'a',
    ]);
    expect(priorOwnership(ownership).map((item) => item.id)).toEqual(['first', 'second']);
  });

  it('does not resolve or replace an unresolved latest owner', () => {
    const former = claim('former', 1, 'known-owner');
    const latest = claim('latest', 2, 'raw-new-owner', 'unresolved');
    const ownership: CardOwnership = { current: latest, history: [former, latest] };
    expect(attributionLabel(latest.owner)).toBe('Unresolved identity: raw-new-owner');
    expect(orderedOwnershipHistory(ownership).at(-1)?.id).toBe('latest');
    expect(attributionLabel(attribution('same-string', 'ambiguous'))).toBe(
      'Ambiguous identity: same-string',
    );
  });
});
