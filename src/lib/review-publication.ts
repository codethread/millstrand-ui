import { reviewPublicationBlock, type ReviewComments } from '../../shared/review-comments';

export function sendReviewBlock(
  snapshot: ReviewComments,
  readiness: {
    hydrated: boolean;
    storageError: boolean;
    unsaved: boolean;
    refreshing: boolean;
    readError: boolean;
    snapshotChanged: boolean;
  },
): string | null {
  if (!readiness.hydrated) return 'Loading saved review drafts…';
  if (readiness.storageError) return 'Resolve draft storage errors before sending.';
  if (readiness.unsaved)
    return 'Adopt or cancel every unsaved draft before sending the saved review.';
  if (readiness.readError || readiness.refreshing)
    return 'Wait for a successful review refresh before sending.';
  if (readiness.snapshotChanged)
    return 'The saved snapshot changed. Inspect the current candidates before starting a new send.';
  return reviewPublicationBlock(snapshot);
}
