import type { DependencyCounts } from './api.ts';

/** Unique direct links, independent of endpoint hydration, lifecycle or display filters. */
export function countDependencies(
  links: readonly { from: string; to: string }[],
): Map<string, DependencyCounts> {
  const counts = new Map<string, DependencyCounts>();
  const seen = new Set<string>();
  for (const { from, to } of links) {
    const pair = JSON.stringify([from, to]);
    if (seen.has(pair)) continue;
    seen.add(pair);
    const outgoing = counts.get(from) ?? { incoming: 0, outgoing: 0 };
    counts.set(from, outgoing);
    outgoing.outgoing += 1;
    const incoming = counts.get(to) ?? { incoming: 0, outgoing: 0 };
    counts.set(to, incoming);
    incoming.incoming += 1;
  }
  return counts;
}
