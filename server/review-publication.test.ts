import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand';
import { commentsFixture } from './review-comments.fixture';
import { parsePublishReview, parseReviewPublicationReceipt } from './review-comments';

const exec = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ stdout: string }>>());
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});
beforeEach(() => {
  exec.mockReset();
});
const pointer = { revision: 'frozen-head', curationVersion: 1 };
const receipt = {
  reviewId: 'review1',
  ...pointer,
  state: 'published',
  comments: [{ id: 'comment1', state: 'published', discussionId: 'remote1', retryable: false }],
};
function mock(snapshot = commentsFixture, outcome: unknown = receipt) {
  exec.mockImplementation(async (_file, argv) => {
    const args = Array.isArray(argv) ? argv : [];
    if (args[3] === 'comments') return { stdout: JSON.stringify(snapshot) };
    if (args[3] === 'publish') {
      if (outcome instanceof Error) throw outcome;
      return { stdout: JSON.stringify(outcome) };
    }
    throw new Error('Unexpected non-publication command');
  });
}
it('dispatches only the saved pointer, never text/positions or curation', async () => {
  mock();
  const result = await new StrandData('/repo/.millstrand').publishReview('review1', pointer);
  expect(result).toEqual(parseReviewPublicationReceipt(receipt));
  expect(exec.mock.calls.at(-1)?.[1]).toEqual([
    '--workspace',
    '/repo/.millstrand',
    'review',
    'publish',
    'review1',
    '--request',
    JSON.stringify(pointer),
  ]);
  expect(exec.mock.calls).toHaveLength(2);
  expect(() => parsePublishReview({ ...pointer, text: 'Never accept client text' })).toThrow();
});
it.each(['revision', 'version', 'outdated', 'done', 'empty', 'unsupported', 'published'] as const)(
  'rejects %s before publication',
  async (reason) => {
    const snapshot = structuredClone(commentsFixture);
    const input = { ...pointer };
    if (reason === 'revision') input.revision = 'old';
    if (reason === 'version') input.curationVersion = 0;
    if (reason === 'outdated') snapshot.review.current = false;
    if (reason === 'done') snapshot.review.decision = 'done';
    if (reason === 'empty') snapshot.comments = [];
    if (reason === 'unsupported')
      snapshot.comments[0]!.position = { ...snapshot.comments[0]!.position, kind: 'unsupported' };
    if (reason === 'published') snapshot.review.publication.state = 'published';
    mock(snapshot);
    await expect(
      new StrandData('/repo/.millstrand').publishReview('review1', input),
    ).rejects.toThrow();
    expect(exec.mock.calls).toHaveLength(1);
  },
);
it('preserves partial/failed receipts and retries the same pointer for upstream reconciliation', async () => {
  const uncertain = {
    ...receipt,
    state: 'failed',
    comments: [
      { id: 'comment1', state: 'reconciling', retryable: false, error: 'Remote receipt uncertain' },
    ],
  };
  mock(commentsFixture, uncertain);
  const data = new StrandData('/repo/.millstrand');
  expect(await data.publishReview('review1', pointer)).toMatchObject({
    state: 'failed',
    comments: [{ state: 'reconciling', discussionId: null }],
  });
  await data.publishReview('review1', pointer);
  const calls = exec.mock.calls.filter(
    (call) => Array.isArray(call[1]) && call[1][3] === 'publish',
  );
  expect(calls[0]?.[1]).toEqual(calls[1]?.[1]);
});
it('propagates uncertain timeouts without issuing rollback or automatic retry', async () => {
  mock(commentsFixture, new Error('Timeout after possible remote effect'));
  await expect(
    new StrandData('/repo/.millstrand').publishReview('review1', pointer),
  ).rejects.toThrow('Timeout');
  expect(exec.mock.calls).toHaveLength(2);
});
it('reconciles a publishing summary even when all comment receipts are already published', async () => {
  const snapshot = structuredClone(commentsFixture);
  snapshot.review.publication.state = 'publishing';
  snapshot.review.curation.mutable = false;
  snapshot.comments[0]!.publication.state = 'published';
  mock(snapshot);
  expect(await new StrandData('/repo/.millstrand').publishReview('review1', pointer)).toMatchObject(
    { state: 'published' },
  );
  expect(exec.mock.calls).toHaveLength(2);
});
it('rejects unrelated or inconsistent receipts after an effect without attempting more writes', async () => {
  mock(commentsFixture, { ...receipt, reviewId: 'different' });
  await expect(
    new StrandData('/repo/.millstrand').publishReview('review1', pointer),
  ).rejects.toThrow('different snapshot');
  expect(exec.mock.calls).toHaveLength(2);
  expect(() =>
    parseReviewPublicationReceipt({
      ...receipt,
      comments: [{ id: 'comment1', state: 'reconciling', retryable: false }],
    }),
  ).toThrow();
});
it('preserves partial outcomes with successful and uncertain per-comment receipts', () => {
  const parsed = parseReviewPublicationReceipt({
    ...receipt,
    state: 'partial',
    comments: [
      ...receipt.comments,
      { id: 'comment2', state: 'reconciling', retryable: false, error: 'Receipt search required' },
    ],
  });
  expect(parsed.state).toBe('partial');
  expect(parsed.comments).toEqual([
    { id: 'comment1', state: 'published', discussionId: 'remote1', retryable: false, error: null },
    {
      id: 'comment2',
      state: 'reconciling',
      discussionId: null,
      retryable: false,
      error: 'Receipt search required',
    },
  ]);
});
