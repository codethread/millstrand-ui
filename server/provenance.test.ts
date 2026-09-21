import { parseCard } from './parse.ts';
import { describe, expect, it } from 'vitest';
import { ProvenanceIndex } from './provenance.ts';

function strand(id: string, attributes: Record<string, unknown>, state = 'active') {
  return {
    id,
    title: id,
    state,
    created_at: '2026-09-20 08:00:00',
    updated_at: '2026-09-20 08:00:00',
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
function claim(id: string, owner: string, claimedAt: string, actor?: string) {
  return strand(
    id,
    {
      'kanban/ownership-claim': 'true',
      'kanban/owner': owner,
      'kanban/claimed-at': claimedAt,
      ...(actor ? { 'identity/by-identity': actor } : {}),
    },
    'closed',
  );
}

describe('durable attribution projection', () => {
  it('retains reporter and A→B→A closed claim history with an unresolved latest owner', () => {
    const projection = new ProvenanceIndex({
      strands: [
        strand('card', { 'kanban/card': 'true', 'kanban/reporter': 'reporter' }, 'closed'),
        identity('reporter-id', 'reporter'),
        identity('owner-b-id', 'owner-b'),
        claim('claim-a1', 'owner-a', '2026-09-20T08:00:00Z'),
        claim('claim-b', 'owner-b', '2026-09-20T08:01:00Z'),
        claim('claim-a2', 'owner-a', '2026-09-20T08:02:00Z'),
      ],
      edges: [
        edge('reporter-id', 'card', 'reported'),
        edge('claim-a1', 'card', 'claims'),
        edge('claim-b', 'card', 'claims'),
        edge('owner-b-id', 'claim-b', 'claimed'),
        edge('claim-a2', 'card', 'claims'),
      ],
    });

    expect(projection.reporter('card')).toEqual({
      identity: 'reporter',
      status: 'resolved',
      identityStrandIds: ['reporter-id'],
    });
    expect(projection.ownership('card').history.map((item) => item.owner.identity)).toEqual([
      'owner-a',
      'owner-b',
      'owner-a',
    ]);
    expect(projection.ownership('card').current).toMatchObject({
      id: 'claim-a2',
      order: 3,
      owner: { identity: 'owner-a', status: 'unresolved', identityStrandIds: [] },
    });
  });

  it('keeps a unique late registry identity unresolved until its role edge arrives', () => {
    const before = new ProvenanceIndex({
      strands: [
        strand('card', { 'kanban/card': 'true', 'kanban/reporter': 'late' }),
        identity('late-id', 'late'),
      ],
      edges: [],
    });
    const after = new ProvenanceIndex({
      strands: [
        strand('card', { 'kanban/card': 'true', 'kanban/reporter': 'late' }),
        identity('late-id', 'late'),
      ],
      edges: [edge('late-id', 'card', 'reported')],
    });

    expect(before.reporter('card')?.status).toBe('unresolved');
    expect(after.reporter('card')).toEqual({
      identity: 'late',
      status: 'resolved',
      identityStrandIds: ['late-id'],
    });
  });

  it('keeps a non-owner note actor separate and projects direct versus inherited task ownership', () => {
    const projection = new ProvenanceIndex({
      strands: [
        strand('card', { 'kanban/card': 'true' }),
        strand('inherited-task', { 'kanban/task': 'true' }),
        strand('direct-task', { 'kanban/task': 'true' }),
        strand('note', { 'note/text': 'Reviewed', 'identity/by-identity': 'reviewer' }, 'closed'),
        identity('owner-id', 'owner'),
        identity('task-owner-id', 'task-owner'),
        identity('reviewer-id', 'reviewer'),
        claim('feature-claim', 'owner', '2026-09-20T08:00:00Z'),
        claim('task-claim', 'task-owner', '2026-09-20T08:01:00Z'),
      ],
      edges: [
        edge('card', 'inherited-task', 'parent-of'),
        edge('card', 'direct-task', 'parent-of'),
        edge('feature-claim', 'card', 'claims'),
        edge('owner-id', 'feature-claim', 'claimed'),
        edge('task-claim', 'direct-task', 'claims'),
        edge('task-owner-id', 'task-claim', 'claimed'),
        edge('reviewer-id', 'note', 'attributed'),
      ],
    });

    expect(projection.noteActor('note')?.identity).toBe('reviewer');
    expect(projection.owner('card')).toBe('owner');
    expect(projection.taskOwnership('inherited-task')).toMatchObject({
      source: 'inherited',
      featureId: 'card',
      claim: { owner: { identity: 'owner' } },
    });
    expect(projection.taskOwnership('direct-task')).toMatchObject({
      source: 'direct',
      claim: { owner: { identity: 'task-owner' } },
    });
  });

  it('reports ambiguous raw attribution and rejects a conflicting enrichment edge', () => {
    const ambiguous = new ProvenanceIndex({
      strands: [
        strand('card', { 'kanban/card': 'true', 'kanban/reporter': 'duplicate' }),
        identity('duplicate-a', 'duplicate'),
        identity('duplicate-b', 'duplicate'),
      ],
      edges: [],
    });
    expect(ambiguous.reporter('card')).toEqual({
      identity: 'duplicate',
      status: 'ambiguous',
      identityStrandIds: ['duplicate-a', 'duplicate-b'],
    });

    const conflicting = new ProvenanceIndex({
      strands: [
        strand('card', { 'kanban/card': 'true', 'kanban/reporter': 'reporter' }),
        identity('other-id', 'other'),
      ],
      edges: [edge('other-id', 'card', 'reported')],
    });
    expect(() => conflicting.reporter('card')).toThrow('conflicts with raw identity');
  });
});

it('counts direct incoming/outgoing dependencies on cards regardless of neighbour state or hydration', () => {
  const row = strand('card', { 'kanban/card': 'true' });
  const projection = new ProvenanceIndex({
    strands: [row, strand('closed', { 'kanban/card': 'true' }, 'closed')],
    edges: [
      edge('card', 'closed', 'depends-on'),
      edge('card', 'external-work', 'depends-on'),
      edge('card', 'external-work', 'depends-on'),
      edge('dependent', 'card', 'depends-on'),
      edge('card', 'child', 'parent-of'),
    ],
  });
  expect(parseCard(row, projection).dependencies).toEqual({ incoming: 1, outgoing: 2 });
  expect(projection.dependencies('closed')).toEqual({ incoming: 1, outgoing: 0 });
  expect(projection.dependencies('child')).toEqual({ incoming: 0, outgoing: 0 });
});
