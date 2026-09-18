import { expect, it } from 'vitest';
import { parseReviewComments } from '../../server/review-comments';
import { commentsFixture } from '../../server/review-comments.fixture';
import {
  publicationReceiptMatchesSnapshot,
  publicationRequest,
  publicationSnapshotChanged,
  sendReviewBlock,
} from './review-publication';

const ready = {
  hydrated: true,
  storageError: false,
  unsaved: false,
  refreshing: false,
  readError: false,
  snapshotChanged: false,
};
it('allows only a saved included snapshot with fresh reads and no active drafts', () => {
  const snapshot = parseReviewComments(commentsFixture);
  expect(sendReviewBlock(snapshot, ready)).toBeNull();
  for (const key of [
    'storageError',
    'unsaved',
    'refreshing',
    'readError',
    'snapshotChanged',
  ] as const)
    expect(sendReviewBlock(snapshot, { ...ready, [key]: true })).not.toBeNull();
  expect(sendReviewBlock(snapshot, { ...ready, hydrated: false })).not.toBeNull();
});
it('permits same-snapshot retry after a partial or uncertain effect, without requiring mutable curation', () => {
  const snapshot = parseReviewComments(commentsFixture);
  snapshot.review.curation.mutable = false;
  snapshot.review.publication.state = 'partial';
  snapshot.comments[0]!.publication.state = 'reconciling';
  expect(sendReviewBlock(snapshot, ready)).toBeNull();
  snapshot.review.publication.state = 'publishing';
  snapshot.comments[0]!.publication.state = 'published';
  expect(sendReviewBlock(snapshot, ready)).toBeNull();
});
it('retries the saved snapshot and accepts receipts only for the displayed revision and version', () => {
  const snapshot = parseReviewComments(commentsFixture);
  const saved = publicationRequest(snapshot, null);
  snapshot.review.curation.version += 1;
  expect(publicationRequest(snapshot, saved)).toBe(saved);
  expect(publicationSnapshotChanged(snapshot, saved)).toBe(true);
  const receipt = {
    reviewId: snapshot.review.id,
    revision: saved.revision,
    curationVersion: saved.curationVersion,
    state: 'published' as const,
    comments: [],
  };
  expect(publicationReceiptMatchesSnapshot(snapshot, receipt)).toBe(false);
  snapshot.review.curation.version = saved.curationVersion;
  expect(publicationReceiptMatchesSnapshot(snapshot, receipt)).toBe(true);
});

it.each(['empty', 'unsupported', 'outdated', 'complete'] as const)(
  'blocks %s saved snapshots',
  (kind) => {
    const snapshot = parseReviewComments(commentsFixture);
    if (kind === 'empty') snapshot.comments[0]!.inclusion = 'dismissed';
    if (kind === 'unsupported')
      snapshot.comments[0]!.position = { kind: 'unsupported', reason: 'Binary' };
    if (kind === 'outdated') snapshot.review.current = false;
    if (kind === 'complete') snapshot.review.publication.state = 'published';
    expect(sendReviewBlock(snapshot, ready)).not.toBeNull();
  },
);
