import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  agentLaunchArgs,
  parseAgentOptions,
  parseAgentPrompt,
  parseAgentReply,
  parsePromptContext,
} from './agent-prompts.ts';
import { StrandData } from './strand.ts';

const exec = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ stdout: string }>>());
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

const prompt = {
  targetId: 'card1',
  alias: 'tui',
  prompt: 'Help with this card',
  requestId: 'ui-0123456789abcdef0123456789abcdef',
};
const options = [
  { kind: 'harness', name: 'pi', provider: 'pi', modes: ['headless', 'interactive'] },
  { kind: 'alias', name: 'tui', provider: 'pi', model: 'sol' },
  { kind: 'harness', name: 'terminal', provider: 'terminal', modes: ['interactive'] },
  { kind: 'alias', name: 'interactive-only', provider: 'terminal' },
];
const reply = {
  id: 'run1',
  title: 'card1 · Help',
  alias: 'tui',
  status: 'ready',
  identity: 'calm-tiger',
  target: 'card1',
};

beforeEach(() => {
  exec.mockReset();
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
  function mockWorkspace() {
    exec.mockImplementation(async (_file, argv) => {
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
              attributes: {},
            },
          ],
        };
      else if (operation === 'agent list') value = options;
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
      return { stdout: JSON.stringify(value) };
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
  it('rejects unknown cards and aliases before any agent run', async () => {
    mockWorkspace();
    const data = new StrandData('/repo/.millstrand');
    await expect(data.promptAgent('unrelated', prompt)).rejects.toThrow('not found');
    await expect(data.promptAgent('card1', { ...prompt, alias: 'not-configured' })).rejects.toThrow(
      'not available headlessly',
    );
    expect(exec.mock.calls.some((call) => JSON.stringify(call[1]).includes('"run"'))).toBe(false);
  });
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
