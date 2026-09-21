import type { LaunchBlocker, LaunchRefusal } from '../shared/api.ts';
import { sorted } from '../shared/array.ts';
import { normalizedLane } from './parse.ts';
import { z } from 'zod';

const strandStates = ['active', 'closed', 'replaced'] as const;

const refusalRowSchema = z
  .object({
    target_id: z.string(),
    target_state: z.enum(strandStates).nullable(),
    target_lane: z.string().nullable(),
    blocker_id: z.string().nullable(),
    blocker_lane: z.string().nullable(),
  })
  .strict();
const refusalRowsSchema = z.array(refusalRowSchema);

/** One target's persisted facts; a null state is a strand that does not exist. */
interface TargetFacts {
  state: z.infer<typeof refusalRowSchema>['target_state'];
  lane: string | null;
  blockers: LaunchBlocker[];
}

/**
 * Why one target cannot launch, or null when it can.
 *
 * Mirrors `assignment/launch-ready?`: the target must be active with no active
 * `depends-on` blockers. Kanban refinement is deliberately stricter than the raw
 * graph predicate because the board has not admitted that idea for agent work yet.
 */
function launchRefusal(facts: TargetFacts): LaunchRefusal | null {
  if (facts.state === null) return { kind: 'missing' };
  if (facts.state !== 'active') return { kind: 'closed', state: facts.state };
  // Graph blockers come first: they are the Harnesses-level constraint, and a
  // refinement card still has to satisfy them after promotion.
  if (facts.blockers.length > 0)
    return {
      kind: 'blocked',
      blockers: sorted(facts.blockers, (a, b) => a.id.localeCompare(b.id)),
    };
  if (facts.lane !== null && normalizedLane(facts.lane) === 'refinement')
    return { kind: 'refinement' };
  return null;
}

/**
 * Group flat `requested target × active blocker` rows into refusals. Every requested
 * strand produces a row (a left join), so an absent strand arrives as a null state.
 */
export function parseLaunchRefusals(value: unknown): Map<string, LaunchRefusal> {
  const parsed = refusalRowsSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`launch refusal rows are invalid: ${z.prettifyError(parsed.error)}`);
  const targets = new Map<string, TargetFacts>();
  for (const row of parsed.data) {
    const facts = targets.get(row.target_id) ?? {
      state: row.target_state,
      lane: row.target_lane,
      blockers: [],
    };
    if (row.blocker_id !== null)
      facts.blockers.push({
        id: row.blocker_id,
        lane: row.blocker_lane === null ? null : normalizedLane(row.blocker_lane),
      });
    targets.set(row.target_id, facts);
  }
  const refusals = new Map<string, LaunchRefusal>();
  for (const [id, facts] of targets) {
    const refusal = launchRefusal(facts);
    if (refusal !== null) refusals.set(id, refusal);
  }
  return refusals;
}

/** The dispatch refusal shown to the user; never publishes or hints at a sent run. */
export function launchRefusalMessage(targetId: string, refusal: LaunchRefusal): string {
  if (refusal.kind === 'missing')
    return `Strand ${targetId} is not in this weaver, so a targeted run cannot launch. Choose an existing target. Your prompt was not sent.`;
  if (refusal.kind === 'closed')
    return `Strand ${targetId} is ${refusal.state}, so a targeted run can never launch. Reopen it before dispatching an agent. Your prompt was not sent.`;
  if (refusal.kind === 'refinement')
    return `Strand ${targetId} is still in refinement, so it is not admitted for agent work. Promote it to pending with \`strand update ${targetId} --attr kanban/lane=pending\` before dispatching an agent. Your prompt was not sent.`;
  const blockers = refusal.blockers
    .map((blocker) => (blocker.lane === null ? blocker.id : `${blocker.id} (${blocker.lane})`))
    .join(', ');
  return `Strand ${targetId} is not launch-ready: active dependencies must close first — ${blockers}. Wait for them, or prompt a ready target. Your prompt was not sent.`;
}
