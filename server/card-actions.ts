import type { CardLane } from '../shared/api.ts';
import { z } from 'zod';

const cardLaneSchema = z.compile(
  z
    .object({
      lane: z.enum(['refinement', 'pending', 'claimed', 'in_review', 'in_production', 'closed']),
    })
    .strict(),
  { strict: true },
);

export function parseCardLane(value: unknown): CardLane {
  const parsed = cardLaneSchema.safeParse(value);
  if (!parsed.success) throw new Error('Choose a known destination lane.');
  return parsed.data.lane;
}

/** A board edit, not a workflow transition: never cascade to children or assign an owner. */
export function moveCardArgs(id: string, lane: CardLane): string[] {
  return [
    'update',
    id,
    '--state',
    lane === 'closed' ? 'closed' : 'active',
    '--attributes',
    JSON.stringify({
      'kanban/lane': lane === 'closed' ? null : lane,
      'kanban/outcome': lane === 'closed' ? 'done' : null,
      'kanban/closed-by': null,
      'kanban/abandon-restore-lane': null,
    }),
  ];
}
