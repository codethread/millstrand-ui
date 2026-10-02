import { expect, it } from 'vitest';
import type { ReviewDirectory } from '../../shared/reviews';
import { reviewDirectoryPollInterval } from './api/reviews';

it('polls available reviews but disables the interval for unsupported workspaces', () => {
  const available: ReviewDirectory = {
    kind: 'available',
    workspace: { path: '/repo/.millstrand', name: 'repo' },
    fetchedAt: '2026-10-02T06:00:00Z',
    reviews: [],
  };

  expect(reviewDirectoryPollInterval(undefined)).toBe(5000);
  expect(reviewDirectoryPollInterval(available)).toBe(5000);
  expect(
    reviewDirectoryPollInterval({ kind: 'unsupported', message: 'Review spool unavailable' }),
  ).toBe(false);
});
