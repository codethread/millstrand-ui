import { vi } from 'vitest';
import type { LaunchRefusal } from '../shared/api.ts';

/** No requested strand is refused launch unless a test overrides the map. */
export function noLaunchRefusals() {
  return vi.fn(async (): Promise<Map<string, LaunchRefusal>> => new Map());
}
