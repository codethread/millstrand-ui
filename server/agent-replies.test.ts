import { describe, expect, it, vi } from 'vitest';
import { parseAgentReply, parsePromptContext } from './agent-replies.ts';
import { StrandData } from './strand.ts';

const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(() => undefined, { [promisify.custom]: exec }) };
});

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

describe('agent reply boundaries', () => {
  it('retains a failed reply result without exposing provider logs', () => {
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
  });

  it('parses historical dashboard context for cards, reviews and review comments', () => {
    expect(parsePromptContext({ source: 'workflow', prompt: 'private' })).toBeNull();
    expect(parsePromptContext({ source: 'millstrand-ui', card: 'old', prompt: 'hello' })).toEqual({
      kind: 'card',
      cardId: 'old',
      text: 'hello',
    });
    expect(
      parsePromptContext({
        source: 'millstrand-ui',
        card: 'r123',
        targetKind: 'review',
        prompt: 'dig in',
        reviewContext: 'Review context: r123',
      }),
    ).toEqual({
      kind: 'review',
      cardId: 'r123',
      text: 'dig in',
      context: 'Review context: r123',
    });
    expect(
      parsePromptContext({
        source: 'millstrand-ui',
        card: 'r123',
        targetKind: 'review-comment',
        prompt: 'revise',
        reviewContext: 'Review context: r123',
        comment: { id: 'c1', revision: 'rev1', candidateVersion: 2 },
      }),
    ).toEqual({
      kind: 'review-comment',
      cardId: 'r123',
      text: 'revise',
      context: 'Review context: r123',
      comment: { id: 'c1', revision: 'rev1', candidateVersion: 2 },
    });
    expect(() =>
      parsePromptContext({
        source: 'millstrand-ui',
        card: 'r123',
        targetKind: 'review-comment',
        prompt: 'revise',
        reviewContext: 'Review context: r123',
      }),
    ).toThrow('Prompt comment must be an object');
  });
});

describe('agent run inspection', () => {
  it('reads a published run reply together with its stored dashboard context', async () => {
    exec.mockReset();
    exec.mockImplementation((_file, argv) => {
      const args = Array.isArray(argv) ? argv : [];
      const operation = args.slice(2).join(' ');
      if (operation === 'agent show run1')
        return Promise.resolve({
          stdout: JSON.stringify({
            ...reply,
            status: 'stopped',
            substatus: 'completed',
            settled: true,
            result: 'Answer',
          }),
        });
      if (operation === 'show run1')
        return Promise.resolve({
          stdout: JSON.stringify({
            attributes: {
              'harness/context': {
                source: 'millstrand-ui',
                card: 'card1',
                target: 'card1',
                prompt: 'Help with this card',
              },
            },
          }),
        });
      throw new Error(`Unexpected command ${operation}`);
    });
    const data = new StrandData('/repo/.millstrand');
    await expect(data.agentReply('run1')).resolves.toMatchObject({
      id: 'run1',
      status: 'stopped',
      result: 'Answer',
      prompt: { kind: 'card', cardId: 'card1', text: 'Help with this card' },
    });
  });

  it('returns a reply with no dashboard context for runs this UI did not launch', async () => {
    exec.mockReset();
    exec.mockImplementation((_file, argv) => {
      const args = Array.isArray(argv) ? argv : [];
      const operation = args.slice(2).join(' ');
      if (operation === 'agent show run2')
        return Promise.resolve({
          stdout: JSON.stringify({ ...reply, id: 'run2', status: 'stopped', settled: true }),
        });
      if (operation === 'show run2')
        return Promise.resolve({
          stdout: JSON.stringify({ attributes: { 'harness/context': { source: 'workflow' } } }),
        });
      throw new Error(`Unexpected command ${operation}`);
    });
    const data = new StrandData('/repo/.millstrand');
    await expect(data.agentReply('run2')).resolves.toMatchObject({ id: 'run2', prompt: null });
  });
});
