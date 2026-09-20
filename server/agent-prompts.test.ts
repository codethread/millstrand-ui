import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  agentLaunchArgs,
  parseAgentOptions,
  parseAgentPrompt,
  parseAgentReply,
  parsePromptContext,
  reviewPromptContext,
} from './agent-prompts.ts';
import { StrandData } from './strand.ts';
import { review } from './reviews.fixture.ts';
import { parseReviewDetail } from './reviews.ts';

const reviewDetail = parseReviewDetail({
  review: {
    ...review,
    repo: '/repo',
    worktree: null,
    report: 'PRIVATE LONG REPORT',
    reviewers: [{ ...review.reviewers[0], result: 'PRIVATE REVIEWER OUTPUT', error: null }],
    notes: [],
    links: [],
    history: [],
  },
});

const { exec, readProvenance } = vi.hoisted(() => ({
  exec: vi.fn(),
  readProvenance: vi.fn(),
}));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});
vi.mock('./workspace-database.ts', () => ({
  WorkspaceDatabase: class {
    readProvenance = readProvenance;
  },
}));

const prompt = {
  targetId: 'card1',
  alias: 'tui',
  prompt: 'Help with this card',
  requestId: 'ui-0123456789abcdef0123456789abcdef',
};
const options = [
  {
    kind: 'harness',
    name: 'pi',
    resolution: 'pi',
    provider: 'pi',
    modes: ['headless', 'interactive'],
  },
  { kind: 'alias', name: 'tui', resolution: 'tui → pi', provider: 'pi', model: 'sol' },
  {
    kind: 'harness',
    name: 'terminal',
    resolution: 'terminal',
    provider: 'terminal',
    modes: ['interactive'],
  },
  {
    kind: 'alias',
    name: 'interactive-only',
    resolution: 'interactive-only → terminal',
    provider: 'terminal',
  },
];
const reply = {
  id: 'run1',
  title: 'card1 · Help',
  state: 'active',
  alias: 'tui',
  harness: 'pi',
  mode: 'headless',
  status: 'ready',
  substatus: 'pending',
  'session-id': 'session1',
  settled: false,
  identity: 'calm-tiger',
  target: 'card1',
};

beforeEach(() => {
  exec.mockReset();
  readProvenance.mockReset();
});

describe('prompt boundaries', () => {
  it('only offers available providers that support headless mode, including their aliases', () => {
    expect(parseAgentOptions(options).map((option) => option.name)).toEqual(['pi', 'tui']);
  });
  it.each([
    { alias: '--interactive' },
    { targetId: '../../elsewhere' },
    { prompt: '  ' },
    { prompt: 'a'.repeat(12001) },
    { prompt: 'a\0b' },
    { requestId: 'anything' },
    { cwd: '/arbitrary/path' },
    { attributes: { command: 'sh' } },
    { targetKind: 'arbitrary' },
    { reviewContext: 'client supplied context' },
  ])('rejects invalid launch fields %j', (change) => {
    expect(() => parseAgentPrompt({ ...prompt, ...change })).toThrow();
  });
  it('passes shell syntax and quotes as one prompt argument, retaining a stable idempotency key', () => {
    const input = parseAgentPrompt({
      ...prompt,
      prompt: 'Quotes " and $(touch /tmp/unsafe) `echo x`\n--interactive',
    });
    const args = agentLaunchArgs('/repo/.millstrand', '/repo', 'card1', input);
    expect(args[args.indexOf('--prompt') + 1]).toContain(input.prompt);
    expect(args).not.toContain('--interactive');
    expect(args.slice(-2)).toEqual(['--request-id', input.requestId]);
    expect(args).toEqual(agentLaunchArgs('/repo/.millstrand', '/repo', 'card1', input));
    expect(JSON.parse(args[args.indexOf('--context') + 1] ?? '')).toEqual({
      source: 'millstrand-ui',
      card: 'card1',
      target: 'card1',
      prompt: input.prompt,
    });
  });
  it('retains a reply even when the harness failed, without exposing provider logs', () => {
    const parsed = parseAgentReply({
      ...reply,
      status: 'failed',
      result: 'Useful answer',
      error: 'Pi produced truncated JSONL: SECRET PROMPT AND LOG',
      env: { TOKEN: 'secret' },
    });
    expect(parsed).toMatchObject({ status: 'failed', result: 'Useful answer' });
    expect(parsed.error).toContain('truncated JSONL');
    expect(JSON.stringify(parsed)).not.toMatch(/SECRET|TOKEN|secret/);
    expect(parsePromptContext({ source: 'workflow', prompt: 'private' })).toBeNull();
  });
});

describe('scoped launch process', () => {
  function mockWorkspace(
    worktree: string | null = null,
    registered = [process.cwd()],
    readReview = () => reviewDetail,
  ) {
    readProvenance.mockResolvedValue({
      strands: [
        {
          id: 'card1',
          title: 'Feature',
          state: 'active',
          created_at: '2026-09-14',
          updated_at: '2026-09-14',
          attributes: { 'kanban/card': 'true' },
        },
        {
          id: 'task1',
          title: 'Task',
          state: 'active',
          created_at: '2026-09-14',
          updated_at: '2026-09-14',
          attributes: { 'kanban/task': 'true' },
        },
        ...(worktree === null
          ? []
          : [
              {
                id: 'claim1',
                title: 'Ownership',
                state: 'closed',
                created_at: '2026-09-14',
                updated_at: '2026-09-14',
                attributes: {
                  'kanban/ownership-claim': 'true',
                  'kanban/owner': 'worker',
                  'kanban/claimed-at': '2026-09-14T00:00:00Z',
                  worktree,
                },
              },
            ]),
      ],
      edges: [
        { from_strand_id: 'card1', to_strand_id: 'task1', edge_type: 'parent-of' },
        ...(worktree === null
          ? []
          : [{ from_strand_id: 'claim1', to_strand_id: 'card1', edge_type: 'claims' }]),
      ],
    });
    exec.mockImplementation((_file, argv) => {
      if (_file === 'git')
        return Promise.resolve({
          stdout: registered
            .map((path) => `worktree ${path}\0HEAD abc\0branch refs/heads/feature\0\0`)
            .join(''),
        });
      const args = Array.isArray(argv) ? argv : [];
      const operation = args.slice(2).join(' ');
      let value: unknown;
      if (operation === 'kanban board --all true')
        value = {
          cards: [
            {
              id: 'card1',
              title: 'Feature',
              state: 'active',
              created_at: '2026-09-14',
              attributes: { worktree },
            },
          ],
        };
      else if (operation === `review show ${reviewDetail.id}`) {
        const current = readReview();
        const { sha, ...mr } = current.mr;
        value = { review: { ...current, mr: { ...mr, headSha: sha } } };
      } else if (operation === 'agent list') value = options;
      else if (operation === 'kanban-export card1')
        value = {
          'root-id': 'card1',
          strands: [
            {
              id: 'task1',
              title: 'Task',
              state: 'active',
              created_at: '2026-09-14',
              attributes: { 'kanban/task': 'true' },
            },
          ],
          'parent-of-edges': [],
          'depends-on-edges': [],
        };
      else if (operation.startsWith('agent run tui ')) value = reply;
      else throw new Error(`Unexpected command ${JSON.stringify([_file, argv])}`);
      return Promise.resolve({ stdout: JSON.stringify(value) });
    });
  }
  it('uses the selected canonical weaver and its server-owned cwd, never a shell', async () => {
    mockWorkspace();
    const data = new StrandData('/repo/.millstrand');
    expect(await data.promptAgent('card1', prompt)).toMatchObject({
      id: 'run1',
      prompt: { cardId: 'card1', text: prompt.prompt },
    });
    const last = exec.mock.calls.at(-1);
    expect(last?.[0]).toBe('strand');
    expect(last?.[1]).toEqual([
      '--workspace',
      '/repo/.millstrand',
      ...agentLaunchArgs('/repo/.millstrand', '/repo', 'card1', prompt),
    ]);
    expect(last?.[2]).toMatchObject({ cwd: '/repo' });
    expect(last?.[2]).not.toHaveProperty('shell');
  });
  it('reports an active target conflict without echoing the command or sending another run', async () => {
    mockWorkspace();
    const dispatch = exec.getMockImplementation();
    exec.mockImplementation((file, argv) => {
      if (Array.isArray(argv) && argv.includes('run'))
        return Promise.reject(
          Object.assign(new Error('Command failed: PRIVATE PROMPT'), {
            stderr: JSON.stringify({
              type: 'domain',
              code: 'domain/error',
              message: 'Target already has an active managed run',
              details: { target: 'card1', runs: ['rt5jw'] },
            }),
          }),
        );
      return dispatch?.(file, argv);
    });
    const data = new StrandData('/repo/.millstrand');
    await expect(data.promptAgent('card1', prompt)).rejects.toMatchObject({
      status: 409,
      message:
        'This target already has an active agent run (rt5jw). Open it in Agents to inspect its progress. Wait for it to settle before starting another run; Prompt agent cannot message a running agent. Your prompt was not sent.',
    });
    expect(
      exec.mock.calls.filter((call) => Array.isArray(call[1]) && call[1].includes('run')),
    ).toHaveLength(1);
  });
  it('dispatches a standalone review through the existing launch and retains inspectable context', async () => {
    const currentReview = { ...reviewDetail, worktree: process.cwd() };
    mockWorkspace(null, [process.cwd()], () => currentReview);
    const data = new StrandData('/repo/.millstrand');
    const input = parseAgentPrompt({
      ...prompt,
      targetKind: 'review',
      targetId: reviewDetail.id,
      prompt: '  dig into this further\nKeep my question intact  ',
    });
    const result = await data.promptAgent(reviewDetail.id, input);
    const context = reviewPromptContext(currentReview, '/repo/.millstrand');
    expect(result.prompt).toEqual({
      kind: 'review',
      cardId: reviewDetail.id,
      text: input.prompt,
      context,
    });
    const args = exec.mock.calls.at(-1)?.[1];
    expect(args).toEqual([
      '--workspace',
      '/repo/.millstrand',
      ...agentLaunchArgs('/repo/.millstrand', process.cwd(), reviewDetail.id, input, context),
    ]);
    const launch = agentLaunchArgs(
      '/repo/.millstrand',
      process.cwd(),
      reviewDetail.id,
      input,
      context,
    );
    expect(launch[launch.indexOf('--prompt') + 1]).toContain(`User prompt:\n${input.prompt}`);
    expect(parsePromptContext(JSON.parse(launch[launch.indexOf('--context') + 1] ?? ''))).toEqual(
      result.prompt,
    );
    expect(exec.mock.calls.some((call) => JSON.stringify(call[1]).includes('kanban'))).toBe(false);
    await expect(data.promptAgent('other', input)).rejects.toThrow('must match');
  });
  it('uses a registered review worktree and rejects a foreign one before dispatch', async () => {
    let currentReview = { ...reviewDetail, worktree: process.cwd() };
    mockWorkspace(null, [process.cwd()], () => currentReview);
    const data = new StrandData('/repo/.millstrand');
    const input = { ...prompt, targetKind: 'review' as const, targetId: reviewDetail.id };
    await data.promptAgent(reviewDetail.id, input);
    expect(exec.mock.calls.at(-1)?.[1]).toContain(process.cwd());
    exec.mockClear();
    currentReview = { ...reviewDetail, worktree: '/foreign' };
    await expect(data.promptAgent(reviewDetail.id, input)).rejects.toThrow(
      'The selected work item’s recorded worktree is unavailable',
    );
    expect(exec.mock.calls.some((call) => JSON.stringify(call[1]).includes('"run"'))).toBe(false);
  });
  it('rejects a review without a recorded worktree instead of launching in the canonical root', async () => {
    mockWorkspace();
    const data = new StrandData('/repo/.millstrand');
    await expect(
      data.promptAgent(reviewDetail.id, {
        ...prompt,
        targetKind: 'review',
        targetId: reviewDetail.id,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('no recorded worktree'),
    });
    expect(exec.mock.calls).toHaveLength(1);
    expect(exec.mock.calls[0]?.[1]).toEqual([
      '--workspace',
      '/repo/.millstrand',
      'review',
      'show',
      reviewDetail.id,
    ]);
  });
  it('rejects unknown cards and aliases before any agent run', async () => {
    mockWorkspace();
    const data = new StrandData('/repo/.millstrand');
    await expect(data.promptAgent('unrelated', prompt)).rejects.toThrow('not found');
    await expect(data.promptAgent('card1', { ...prompt, alias: 'not-configured' })).rejects.toThrow(
      'not available headlessly',
    );
    expect(exec.mock.calls.some((call) => JSON.stringify(call[1]).includes('"run"'))).toBe(false);
  });
  it('bypasses a populated review cache and dispatches with current metadata and worktree', async () => {
    let currentReview = reviewDetail;
    mockWorkspace(null, [process.cwd()], () => currentReview);
    const data = new StrandData('/repo/.millstrand');
    expect(await data.review(reviewDetail.id)).toEqual(reviewDetail);
    currentReview = {
      ...reviewDetail,
      current: false,
      stage: 'failed',
      worktree: process.cwd(),
      mr: { ...reviewDetail.mr, sha: 'new-head' },
    };
    // The read surface is still cached while dispatch must get fresh evidence.
    expect(await data.review(reviewDetail.id)).toEqual(reviewDetail);
    const input = { ...prompt, targetKind: 'review' as const, targetId: reviewDetail.id };
    const result = await data.promptAgent(reviewDetail.id, input);
    expect(result.prompt).toMatchObject({
      context: reviewPromptContext(currentReview, '/repo/.millstrand'),
    });
    expect(exec.mock.calls.at(-1)?.[1]).toEqual([
      '--workspace',
      '/repo/.millstrand',
      ...agentLaunchArgs(
        '/repo/.millstrand',
        process.cwd(),
        reviewDetail.id,
        input,
        reviewPromptContext(currentReview, '/repo/.millstrand'),
      ),
    ]);
    expect(
      exec.mock.calls.filter((call) => JSON.stringify(call[1]).includes('"review","show"')),
    ).toHaveLength(2);
  });
  it.each([
    { state: 'closed', decision: 'pending' as const },
    { state: 'active', decision: 'done' as const },
    { state: 'active', decision: 'dismissed' as const },
  ])(
    'rejects a no-longer-pending review at dispatch despite cached pending data: %j',
    async (change) => {
      let currentReview = reviewDetail;
      mockWorkspace(null, [process.cwd()], () => currentReview);
      const data = new StrandData('/repo/.millstrand');
      await data.review(reviewDetail.id);
      currentReview = { ...reviewDetail, ...change };
      exec.mockClear();
      await expect(
        data.promptAgent(reviewDetail.id, {
          ...prompt,
          targetKind: 'review',
          targetId: reviewDetail.id,
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('no longer active and pending'),
      });
      expect(exec.mock.calls).toHaveLength(1);
      expect(exec.mock.calls[0]?.[1]).toEqual([
        '--workspace',
        '/repo/.millstrand',
        'review',
        'show',
        reviewDetail.id,
      ]);
    },
  );
  it('launches in the selected card’s recorded worktree while retaining its canonical weaver', async () => {
    mockWorkspace(process.cwd());
    const data = new StrandData('/repo/.millstrand');
    await data.promptAgent('card1', prompt);
    expect(exec.mock.calls.at(-1)?.[1]).toEqual([
      '--workspace',
      '/repo/.millstrand',
      ...agentLaunchArgs('/repo/.millstrand', process.cwd(), 'card1', prompt),
    ]);
  });
  it.each(['/other-repository', '/missing-worktree', 'relative/path'])(
    'rejects unavailable or foreign recorded worktree %s',
    async (path) => {
      mockWorkspace(path, ['/missing-worktree']);
      await expect(
        new StrandData('/repo/.millstrand').promptAgent('card1', prompt),
      ).rejects.toThrow('recorded worktree is unavailable');
      expect(exec.mock.calls.some((call) => JSON.stringify(call[1]).includes('"run"'))).toBe(false);
    },
  );
  it('allows a graph descendant and rejects unrelated strand targets', async () => {
    mockWorkspace();
    const data = new StrandData('/repo/.millstrand');
    await expect(data.promptAgent('card1', { ...prompt, targetId: 'outside' })).rejects.toThrow(
      'not in the selected card',
    );
    expect(exec.mock.calls.some((call) => JSON.stringify(call[1]).includes('"run"'))).toBe(false);
    await data.promptAgent('card1', { ...prompt, targetId: 'task1' });
    expect(exec.mock.calls.at(-1)?.[1]).toContain('task1');
  });
});

it('builds concise metadata context including missing and stale state without duplicating evidence', () => {
  const context = reviewPromptContext({ ...reviewDetail, current: false }, '/repo/.millstrand');
  for (const value of [
    'r123',
    'merge-request review',
    'active',
    'reviewed',
    'pending',
    'false',
    '/repo',
    '12',
    'https://example.com/mr/12',
    'abc',
    'base: unavailable',
    'not recorded',
    'strand show r123',
    'strand review show r123',
  ])
    expect(context).toContain(value);
  expect(context).not.toMatch(/PRIVATE|result|diff/);
  expect(parsePromptContext({ source: 'millstrand-ui', card: 'old', prompt: 'hello' })).toEqual({
    kind: 'card',
    cardId: 'old',
    text: 'hello',
  });
});
