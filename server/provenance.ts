import { z } from 'zod';
import type {
  AgentIdentity,
  AgentRun,
  AgentWork,
  CardOwnership,
  IdentityAttribution,
  LogContinuation,
  OwnershipClaim,
  TaskOwnership,
} from '../shared/api.ts';
import type { LogBinding } from '../shared/log-activity.ts';
import { sorted } from '../shared/array.ts';
import { providerSchema } from '../shared/session-log.ts';
import { jsonObjectSchema } from './parse.ts';

const strandStateSchema = z.enum(['active', 'closed', 'replaced']);
const strandSchema = z.object({
  id: z.string(),
  title: z.string(),
  state: strandStateSchema,
  created_at: z.string(),
  updated_at: z.string(),
  attributes: jsonObjectSchema,
});
const edgeKinds = [
  'reported',
  'claimed',
  'attributed',
  'performed',
  'claims',
  'serves',
  'serves-root',
  'resumes',
  'continues',
  'parent-of',
] as const;
const edgeSchema = z.object({
  from_strand_id: z.string(),
  to_strand_id: z.string(),
  edge_type: z.enum(edgeKinds),
});
const snapshotSchema = z.object({
  strands: z.array(strandSchema),
  edges: z.array(edgeSchema),
});
const runStatusSchema = z.enum(['ready', 'running', 'stopped', 'failed']);
const runSubstatusSchema = z
  .enum([
    'pending',
    'completed',
    'requested',
    'abandoned',
    'bootstrap',
    'launch',
    'execution',
    'reconciliation',
  ])
  .nullable()
  .optional();
const identityAttributesSchema = z
  .object({
    'identity/session': z.literal('true'),
    'identity/id': z.string().min(1),
    'identity/harness': z.string().min(1),
    'identity/native-session-id': z.string().min(1).optional(),
    'identity/model': z.string().optional(),
    'identity/thinking-level': z.string().optional(),
  })
  .loose();
const runAttributesSchema = z
  .object({
    'harness/run': z.literal('true'),
    'harness/published': z.literal('true'),
    'identity/id': z.string().min(1).optional(),
    'harness/request-id': z.string().optional(),
    'harness/session-id': z.string().min(1).optional(),
    'harness/alias': z.string().min(1),
    'harness/harness': z.string().min(1),
    'harness/status': runStatusSchema,
    'harness/substatus': runSubstatusSchema,
    'harness/mode': z.enum(['headless', 'interactive']),
    'harness/model': z.string().optional(),
    'harness/effort': z.string().optional(),
    'harness/cwd': z.string().optional(),
    'harness/started-at': z.string().optional(),
    'harness/finished-at': z.string().optional(),
  })
  .loose();
const claimAttributesSchema = z
  .object({
    'kanban/ownership-claim': z.literal('true'),
    'kanban/owner': z.string().min(1),
    'kanban/claimed-at': z.string().min(1),
    'identity/by-identity': z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    worktree: z.string().min(1).optional(),
    'kanban/run-id': z.string().min(1).optional(),
  })
  .loose();

type Strand = z.infer<typeof strandSchema>;
type EdgeKind = (typeof edgeKinds)[number];
type Edge = z.infer<typeof edgeSchema>;
type IdentityRecord = {
  strand: Strand;
  attributes: z.infer<typeof identityAttributesSchema>;
};
type RunRecord = {
  strand: Strand;
  attributes: z.infer<typeof runAttributesSchema>;
};

function parseSchema<T>(schema: z.ZodType<T>, value: unknown, where: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${where} is invalid: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

function unique(values: string[]): string[] {
  return sorted([...new Set(values)]);
}

/** Parsed once from the selective persisted graph read. All role projections use durable records/edges. */
export class ProvenanceIndex {
  private readonly strands: Map<string, Strand>;
  private readonly edges: Edge[];
  private readonly identities: IdentityRecord[];
  private readonly identitiesByFriendly = new Map<string, IdentityRecord[]>();
  private readonly runs: RunRecord[];
  private readonly cardOwnership = new Map<string, CardOwnership>();

  constructor(value: unknown) {
    const snapshot = parseSchema(snapshotSchema, value, 'persisted provenance');
    this.strands = new Map(snapshot.strands.map((strand) => [strand.id, strand]));
    this.edges = snapshot.edges;
    this.identities = snapshot.strands
      .filter((strand) => strand.attributes['identity/session'] === 'true')
      .map((strand) => ({
        strand,
        attributes: parseSchema(
          identityAttributesSchema,
          strand.attributes,
          `identity ${strand.id}`,
        ),
      }));
    for (const identity of this.identities) {
      const friendly = identity.attributes['identity/id'];
      this.identitiesByFriendly.set(friendly, [
        ...(this.identitiesByFriendly.get(friendly) ?? []),
        identity,
      ]);
    }
    this.runs = snapshot.strands
      .filter(
        (strand) =>
          strand.attributes['harness/run'] === 'true' &&
          strand.attributes['harness/published'] === 'true',
      )
      .map((strand) => ({
        strand,
        attributes: parseSchema(runAttributesSchema, strand.attributes, `run ${strand.id}`),
      }));
  }

  private outgoing(id: string, kind: EdgeKind): string[] {
    return unique(
      this.edges
        .filter((edge) => edge.from_strand_id === id && edge.edge_type === kind)
        .map((edge) => edge.to_strand_id),
    );
  }

  private incoming(id: string, kind: EdgeKind): string[] {
    return unique(
      this.edges
        .filter((edge) => edge.to_strand_id === id && edge.edge_type === kind)
        .map((edge) => edge.from_strand_id),
    );
  }

  private identityRecord(id: string, relation: EdgeKind, target: string): IdentityRecord {
    const identity = this.identities.find((candidate) => candidate.strand.id === id);
    if (!identity)
      throw new Error(`${relation} edge ${id} -> ${target} does not start at an identity record`);
    return identity;
  }

  private attribution(raw: string, target: string, relation: EdgeKind): IdentityAttribution {
    const linked = this.incoming(target, relation).map((id) =>
      this.identityRecord(id, relation, target),
    );
    const conflicting = linked.find((identity) => identity.attributes['identity/id'] !== raw);
    if (conflicting)
      throw new Error(
        `${relation} edge to ${target} conflicts with raw identity ${raw}: ${conflicting.strand.id}`,
      );
    if (linked.length === 1)
      return { identity: raw, status: 'resolved', identityStrandIds: [linked[0]!.strand.id] };
    if (linked.length > 1)
      return {
        identity: raw,
        status: 'ambiguous',
        identityStrandIds: linked.map((identity) => identity.strand.id),
      };
    const candidates = this.identitiesByFriendly.get(raw) ?? [];
    return candidates.length > 1
      ? {
          identity: raw,
          status: 'ambiguous',
          identityStrandIds: sorted(candidates.map((identity) => identity.strand.id)),
        }
      : { identity: raw, status: 'unresolved', identityStrandIds: [] };
  }

  private claim(id: string, order: number): OwnershipClaim {
    const strand = this.strands.get(id);
    if (!strand) throw new Error(`claims edge references missing ownership record ${id}`);
    const attrs = parseSchema(claimAttributesSchema, strand.attributes, `ownership claim ${id}`);
    const actor = attrs['identity/by-identity'];
    return {
      id,
      owner: this.attribution(attrs['kanban/owner'], id, 'claimed'),
      actor: actor === undefined ? null : this.attribution(actor, id, 'attributed'),
      claimedAt: attrs['kanban/claimed-at'],
      order,
      branch: attrs.branch ?? null,
      worktree: attrs.worktree ?? null,
      runId: attrs['kanban/run-id'] ?? null,
    };
  }

  ownership(target: string): CardOwnership {
    const cached = this.cardOwnership.get(target);
    if (cached) return cached;
    const claims = this.incoming(target, 'claims').map((id) => {
      const strand = this.strands.get(id);
      if (!strand) throw new Error(`claims edge references missing ownership record ${id}`);
      const attrs = parseSchema(claimAttributesSchema, strand.attributes, `ownership claim ${id}`);
      return { id, claimedAt: attrs['kanban/claimed-at'] };
    });
    const ordered = sorted(
      claims,
      (a, b) => a.claimedAt.localeCompare(b.claimedAt) || a.id.localeCompare(b.id),
    ).map(({ id }, index) => this.claim(id, index + 1));
    const ownership = { current: ordered.at(-1) ?? null, history: ordered };
    this.cardOwnership.set(target, ownership);
    return ownership;
  }

  cardRows(): unknown[] {
    return [...this.strands.values()].filter(
      (strand) => strand.attributes['kanban/card'] === 'true',
    );
  }

  reporter(cardId: string): IdentityAttribution | null {
    const raw = this.strands.get(cardId)?.attributes['kanban/reporter'];
    if (raw === undefined) return null;
    if (typeof raw !== 'string' || raw.length === 0)
      throw new Error(`card ${cardId} has invalid kanban/reporter`);
    return this.attribution(raw, cardId, 'reported');
  }

  noteActor(noteId: string): IdentityAttribution | null {
    const raw = this.strands.get(noteId)?.attributes['identity/by-identity'];
    if (raw === undefined) return null;
    if (typeof raw !== 'string' || raw.length === 0)
      throw new Error(`note ${noteId} has invalid identity/by-identity`);
    return this.attribution(raw, noteId, 'attributed');
  }

  taskOwnership(taskId: string): TaskOwnership | null {
    const direct = this.ownership(taskId);
    if (direct.current) return { source: 'direct', claim: direct.current };
    const featureIds = this.incoming(taskId, 'parent-of').filter(
      (id) => this.strands.get(id)?.attributes['kanban/card'] === 'true',
    );
    if (featureIds.length > 1)
      throw new Error(`task ${taskId} has multiple feature parents: ${featureIds.join(', ')}`);
    const featureId = featureIds[0];
    if (!featureId) return null;
    const inherited = this.ownership(featureId).current;
    return inherited ? { source: 'inherited', featureId, claim: inherited } : null;
  }

  owner(target: string): string | null {
    const strand = this.strands.get(target);
    if (!strand) return null;
    if (strand.attributes['kanban/task'] === 'true')
      return this.taskOwnership(target)?.claim.owner.identity ?? null;
    return this.ownership(target).current?.owner.identity ?? null;
  }

  private continuation(runId: string): LogContinuation | null {
    const resumes = this.outgoing(runId, 'resumes');
    const continues = this.outgoing(runId, 'continues');
    if (resumes.length + continues.length > 1)
      throw new Error(`run ${runId} has ambiguous continuation provenance`);
    if (resumes[0]) return { kind: 'native-resume', predecessorRunId: resumes[0] };
    if (continues[0]) return { kind: 'fresh-retry', predecessorRunId: continues[0] };
    return null;
  }

  private runParticipants(run: RunRecord): IdentityAttribution[] {
    const linked = this.incoming(run.strand.id, 'performed').map((id) =>
      this.identityRecord(id, 'performed', run.strand.id),
    );
    if (linked.length > 0)
      return linked.map((identity) => ({
        identity: identity.attributes['identity/id'],
        status: 'resolved' as const,
        identityStrandIds: [identity.strand.id],
      }));
    const raw = run.attributes['identity/id'];
    return raw === undefined ? [] : [this.attribution(raw, run.strand.id, 'performed')];
  }

  private agentRun(run: RunRecord): AgentRun {
    const attrs = run.attributes;
    const targets = this.outgoing(run.strand.id, 'serves');
    if (targets.length > 1) throw new Error(`run ${run.strand.id} serves multiple direct targets`);
    return {
      id: run.strand.id,
      requestId: attrs['harness/request-id'] ?? null,
      title: run.strand.title,
      alias: attrs['harness/alias'],
      harness: attrs['harness/harness'],
      status: attrs['harness/status'],
      substatus: attrs['harness/substatus'] ?? null,
      mode: attrs['harness/mode'],
      model: attrs['harness/model'] ?? null,
      effort: attrs['harness/effort'] ?? null,
      cwd: attrs['harness/cwd'] ?? null,
      target: targets[0] ?? null,
      rootTargets: this.outgoing(run.strand.id, 'serves-root'),
      participants: this.runParticipants(run),
      continuation: this.continuation(run.strand.id),
      createdAt: run.strand.created_at,
      startedAt: attrs['harness/started-at'] ?? null,
      finishedAt: attrs['harness/finished-at'] ?? null,
    };
  }

  agents(): { identities: AgentIdentity[]; runs: AgentRun[] } {
    const runs = sorted(
      this.runs.map((run) => this.agentRun(run)),
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
    const currentWork = new Map<string, AgentWork[]>();
    for (const strand of this.strands.values()) {
      const card = strand.attributes['kanban/card'] === 'true';
      const task = strand.attributes['kanban/task'] === 'true';
      if (!card && !task) continue;
      const claim = task ? this.taskOwnership(strand.id)?.claim : this.ownership(strand.id).current;
      if (claim?.owner.status !== 'resolved') continue;
      const identityStrand = claim.owner.identityStrandIds[0]!;
      currentWork.set(identityStrand, [
        ...(currentWork.get(identityStrand) ?? []),
        {
          id: strand.id,
          title: strand.title,
          state: strand.state,
          kind: card ? 'card' : 'task',
        },
      ]);
    }
    const identities = this.identities.map((identity): AgentIdentity => {
      const attrs = identity.attributes;
      const strandId = identity.strand.id;
      return {
        id: attrs['identity/id'],
        strandId,
        harness: attrs['identity/harness'],
        model: attrs['identity/model'] ?? null,
        effort: attrs['identity/thinking-level'] ?? null,
        createdAt: identity.strand.created_at,
        runs: runs.filter((run) =>
          run.participants.some(
            (participant) =>
              participant.status === 'resolved' && participant.identityStrandIds.includes(strandId),
          ),
        ),
        work: currentWork.get(strandId) ?? [],
      };
    });
    return { identities, runs };
  }

  logBindings(): LogBinding[] {
    const { identities } = this.agents();
    return identities.map((identity) => {
      const record = this.identities.find(
        (candidate) => candidate.strand.id === identity.strandId,
      )!;
      const candidates = identity.runs.flatMap((run) => {
        const stored = this.runs.find((candidate) => candidate.strand.id === run.id)!;
        const provider = providerSchema.safeParse(stored.attributes['harness/harness']);
        const session = stored.attributes['harness/session-id'];
        return provider.success && session
          ? [{ run, source: { provider: provider.data, session } }]
          : [];
      });
      const running = candidates.find(({ run }) => run.status === 'running')?.source;
      const provider = providerSchema.safeParse(record.attributes['identity/harness']);
      const nativeSession = record.attributes['identity/native-session-id'];
      const native =
        provider.success && nativeSession
          ? { provider: provider.data, session: nativeSession }
          : null;
      return {
        identity: identity.id,
        source: running ?? native ?? candidates[0]?.source ?? null,
        activity: { kind: 'idle' as const },
      };
    });
  }
}

export function emptyProvenance(): ProvenanceIndex {
  return new ProvenanceIndex({ strands: [], edges: [] });
}
