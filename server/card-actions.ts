import type { CardLane } from '../shared/api.ts';
import { object } from './parse.ts';

export function parseCardLane(value: unknown): CardLane {
  const lane = object(value, 'lane change')['lane'];
  switch (lane) {
    case 'refinement':
    case 'pending':
    case 'claimed':
    case 'in_review':
    case 'in_production':
    case 'closed':
      return lane;
    default:
      throw new Error('Choose a known destination lane.');
  }
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
