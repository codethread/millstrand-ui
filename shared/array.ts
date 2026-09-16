export function sorted<T>(values: readonly T[], compare?: (left: T, right: T) => number): T[] {
  const copy = Array.from(values);
  // ES2022 is still part of Vite's browser target, so avoid Array.prototype.toSorted.
  // oxlint-disable-next-line unicorn/no-array-sort
  return copy.sort(compare);
}

export function reversed<T>(values: readonly T[]): T[] {
  const copy = Array.from(values);
  // ES2022 is still part of Vite's browser target, so avoid Array.prototype.toReversed.
  // oxlint-disable-next-line unicorn/no-array-reverse
  return copy.reverse();
}
