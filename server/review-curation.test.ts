import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand';
import { commentsFixture } from './review-comments.fixture';
import { parseCurateReview, parseReviewComments } from './review-comments';

const exec = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ stdout: string }>>());
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

beforeEach(() => {
  exec.mockReset();
});
const change = {
  revision: 'frozen-head',
  expectedVersion: 1,
  by: 'user-supplied',
  changes: [{ id: 'comment1', inclusion: 'dismissed' as const }],
};

function mock(snapshot = commentsFixture) {
  exec.mockImplementation(async (file, argv) => {
    if (file === 'git') return { stdout: `worktree ${process.cwd()}\0HEAD abc\0\0` };
    const args = Array.isArray(argv) ? argv : [];
    const op = args.slice(2);
    if (op[0] === 'review' && op[1] === 'comments') return { stdout: JSON.stringify(snapshot) };
    if (op[0] === 'review' && op[1] === 'curate') return { stdout: JSON.stringify(snapshot) };
    throw new Error(`Unexpected command ${JSON.stringify(op)}`);
  });
}

it('uses canonical comments and invokes curate with JSON as one argv and honest actor', async () => {
  mock();
  const data = new StrandData('/repo/.millstrand');
  expect(await data.curateReview('review1', parseCurateReview(change))).toEqual(
    parseReviewComments(commentsFixture),
  );
  expect(exec.mock.calls.at(-1)?.[1]).toEqual([
    '--workspace',
    '/repo/.millstrand',
    'review',
    'curate',
    'review1',
    '--request',
    JSON.stringify({ ...change, by: 'millstrand-ui' }),
  ]);
});
it.each(['version', 'revision', 'locked', 'outdated', 'membership', 'candidate'] as const)(
  'rejects %s mismatch before mutation',
  async (reason) => {
    const snapshot = structuredClone(commentsFixture);
    const input = structuredClone(change);
    if (reason === 'version') input.expectedVersion = 0;
    if (reason === 'revision') input.revision = 'older';
    if (reason === 'locked') snapshot.review.curation.mutable = false;
    if (reason === 'outdated') snapshot.review.current = false;
    if (reason === 'membership') input.changes[0]!.id = 'other';
    mock(snapshot);
    const parsed = parseCurateReview(input);
    if (reason === 'candidate')
      parsed.changes[0]!.candidate = { expectedVersion: 2, text: 'Edited' };
    await expect(
      new StrandData('/repo/.millstrand').curateReview('review1', parsed),
    ).rejects.toThrow();
    expect(exec.mock.calls).toHaveLength(1);
  },
);
