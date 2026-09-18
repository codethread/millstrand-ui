import { appendFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionLogReader } from './session-log-reader.ts';

const roots: string[] = [];

async function fixture(
  provider: 'pi' | 'codex' | 'claude',
  name: string,
  contents: string,
): Promise<SessionLogReader> {
  const root = await mkdtemp(join(tmpdir(), 'session-log-'));
  roots.push(root);
  const directory = join(root, `${provider}-dialogue`);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${name}.jsonl`), contents);
  return new SessionLogReader({ stateRoot: root });
}

function record(event: 'prompt' | 'reply', text: string): string {
  return JSON.stringify({
    v: 1,
    event,
    ts: '2026-09-18T00:00:00.000Z',
    session_id: 'source',
    text,
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SessionLogReader snapshots', () => {
  it('keeps complete records at stable byte offsets and defers an unterminated line', async () => {
    const first = record('prompt', 'First prompt');
    const second = record('reply', 'Reply');
    const reader = await fixture(
      'pi',
      'session-1',
      `${first}\nnot json\n${second}\n${record('reply', 'live')}`,
    );

    await expect(reader.snapshot('pi', 'session-1')).resolves.toMatchObject({
      events: [
        { id: '0', record: { event: 'prompt', text: 'First prompt' } },
        {
          id: String(Buffer.byteLength(`${first}\nnot json\n`)),
          record: { event: 'reply', text: 'Reply' },
        },
      ],
      skipped: 1,
      truncated: false,
    });
  });

  it('picks up appended complete lines once without changing earlier IDs', async () => {
    const first = record('prompt', 'Unicode 🦦');
    const second = record('reply', 'New activity');
    const reader = await fixture('pi', 'live', `${first}\n${second}`);
    const before = await reader.snapshot('pi', 'live');
    expect(before.events).toHaveLength(1);
    await appendFile(join(reader.stateRoot, 'pi-dialogue/live.jsonl'), '\n');
    const after = await reader.snapshot('pi', 'live');
    expect(after.events[0]).toEqual(before.events[0]);
    expect(after.events[1]).toMatchObject({
      id: String(Buffer.byteLength(`${first}\n`)),
      record: { text: 'New activity' },
    });
    expect(after.events).toHaveLength(2);
  });

  it('rejects a symlink provider directory even for direct snapshot requests', async () => {
    const reader = await fixture('pi', 'safe', `${record('prompt', 'safe')}\n`);
    await symlink(join(reader.stateRoot, 'pi-dialogue'), join(reader.stateRoot, 'codex-dialogue'));
    await expect(reader.snapshot('codex', 'safe')).rejects.toThrow('not a regular directory');
  });

  it('bounds old content and records while retaining malformed complete records as skipped', async () => {
    const lines = Array.from({ length: 401 }, (_, index) =>
      index === 1 ? 'invalid json' : record('reply', `line ${index}`),
    );
    const reader = await fixture('codex', 'bounded', `${lines.join('\n')}\n`);
    const snapshot = await reader.snapshot('codex', 'bounded');

    expect(snapshot.events).toHaveLength(399);
    expect(snapshot.skipped).toBe(1);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.events[0]?.record.text).toBe('line 2');
  });

  it('rejects path traversal and symlink sources', async () => {
    const reader = await fixture('claude', 'safe', `${record('prompt', 'safe')}\n`);
    const root = reader.stateRoot;
    await symlink(
      join(root, 'claude-dialogue', 'safe.jsonl'),
      join(root, 'claude-dialogue', 'linked.jsonl'),
    );

    await expect(reader.snapshot('claude', '../safe')).rejects.toThrow('Session must');
    await expect(reader.snapshot('claude', 'linked')).rejects.toThrow();
  });
});
