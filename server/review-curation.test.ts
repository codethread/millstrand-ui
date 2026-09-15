import { beforeEach, expect, it, vi } from 'vitest';
import { StrandData } from './strand';
import { commentsFixture } from './review-comments.fixture';
import { parseCurateReview, parseReviewComments } from './review-comments';
import { parseAgentPrompt, parsePromptContext } from './agent-prompts';
import { review } from './reviews.fixture';

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
    if (op[0] === 'review' && op[1] === 'show')
      return {
        stdout: JSON.stringify({
          review: {
            ...review,
            id: 'review1',
            worktree: process.cwd(),
            notes: [],
            links: [],
            history: [],
            report: null,
          },
        }),
      };
    if (op[0] === 'agent' && op[1] === 'list')
      return {
        stdout: JSON.stringify([
          { name: 'tui', provider: 'tui', kind: 'harness', modes: ['headless'] },
        ]),
      };
    if (op[0] === 'agent' && op[1] === 'run')
      return {
        stdout: JSON.stringify({ id: 'run1', title: 'Proposal', alias: 'tui', status: 'ready' }),
      };
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
it('persists stable comment identity and base candidate in agent context without adopting', async () => {
  mock();
  const input = parseAgentPrompt({
    targetKind: 'review-comment',
    targetId: 'review1',
    comment: { id: 'comment1', revision: 'frozen-head', candidateVersion: 1 },
    alias: 'tui',
    prompt: 'Explain the guard more clearly',
    requestId: 'ui-0123456789abcdef',
  });
  const reply = await new StrandData('/repo/.millstrand').promptAgent('review1', input);
  expect(reply.prompt).toMatchObject({
    kind: 'review-comment',
    comment: { id: 'comment1', revision: 'frozen-head', candidateVersion: 1 },
  });
  const argv = exec.mock.calls.at(-1)?.[1];
  if (!Array.isArray(argv)) throw new Error('Missing argv');
  const stored = argv[argv.indexOf('--context') + 1];
  expect(parsePromptContext(JSON.parse(stored))).toEqual(reply.prompt);
  expect(argv[argv.indexOf('--prompt') + 1]).toContain('Do not adopt, curate, publish');
  expect(exec.mock.calls.some((call) => JSON.stringify(call[1]).includes('"curate"'))).toBe(false);
});
it('rejects a stale comment prompt before agent launch', async () => {
  mock();
  const input = parseAgentPrompt({
    targetKind: 'review-comment',
    targetId: 'review1',
    comment: { id: 'comment1', revision: 'frozen-head', candidateVersion: 2 },
    alias: 'tui',
    prompt: 'Revise',
    requestId: 'ui-0123456789abcdef',
  });
  await expect(
    new StrandData('/repo/.millstrand').promptAgent('review1', input),
  ).rejects.toMatchObject({ status: 409 });
  expect(exec.mock.calls.some((call) => JSON.stringify(call[1]).includes('"run"'))).toBe(false);
});
