import { expect, it } from 'vitest';
import { countDependencies } from './dependencies.ts';

it('counts unique directed neighbours, including both directions and self-links', () => {
  const counts = countDependencies([
    { from: 'a', to: 'b' },
    { from: 'a', to: 'b' },
    { from: 'b', to: 'a' },
    { from: 'a', to: 'a' },
    { from: 'outside', to: 'a' },
  ]);
  expect(counts.get('a')).toEqual({ incoming: 3, outgoing: 2 });
  expect(counts.get('b')).toEqual({ incoming: 1, outgoing: 1 });
  expect(counts.get('outside')).toEqual({ incoming: 0, outgoing: 1 });
  expect(countDependencies([]).size).toBe(0);
});
