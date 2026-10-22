import { appendFile, mkdir, mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentDirectory, AgentRun } from '../shared/api.ts';
import { codexChildSession, externalRunActivity, observeRunActivity } from './run-activity.ts';
import { SessionLogReader } from './session-log-reader.ts';

function encode(value: string): string {
  return Buffer.from(value).toString('base64');
}

const now = new Date('2026-10-21T06:00:00Z');
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

function run(change: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'b6xys',
    requestId: null,
    title: 'Direct session',
    alias: null,
    harness: 'codex',
    status: 'running',
    substatus: null,
    mode: 'external',
    model: null,
    effort: 'high',
    cwd: null,
    ownership: 'external',
    target: null,
    rootTargets: [],
    participants: [],
    session: { provider: 'codex', session: 'parent1' },
    continuation: null,
    createdAt: '2026-10-09 12:14:16',
    startedAt: null,
    finishedAt: null,
    activity: { kind: 'lifecycle' },
    ...change,
  };
}

function directory(runs: AgentRun[]): AgentDirectory {
  return {
    workspace: { path: '/w', name: 'w' },
    fetchedAt: now.toISOString(),
    identities: [
      {
        id: 'sunny-smart-eagle',
        strandId: 'iaia4',
        harness: 'codex',
        model: null,
        effort: null,
        parentIdentityStrandIds: [],
        createdAt: '2026-10-09 12:14:16',
        runs,
        work: [],
      },
    ],
    runs,
  };
}

function record(event: string, ts: string, agentId: string | null = null): string {
  return `${JSON.stringify({ v: 1, event, ts, session_id: 'parent1', agent_id: agentId })}\n`;
}

async function dialogueRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'run-activity-'));
  roots.push(root);
  await mkdir(join(root, 'codex-dialogue'));
  await mkdir(join(root, 'claude-dialogue'));
  return root;
}

async function writeAt(path: string, content: string, at: string): Promise<void> {
  await appendFile(path, content);
  await utimes(path, new Date(at), new Date(at));
}

async function activity(root: string, runs: AgentRun[]) {
  const observed = await observeRunActivity(
    directory(runs),
    new SessionLogReader({ stateRoot: root }),
    now,
  );
  return observed.runs.map((item) => item.activity.kind);
}

describe('externalRunActivity', () => {
  it.each([
    ['old dialogue write', { at: new Date('2026-10-09T14:07:43Z'), ended: false }, 'quiet'],
    ['recent dialogue write', { at: new Date('2026-10-21T05:30:00Z'), ended: false }, 'recent'],
    ['recent explicit session end', { at: new Date('2026-10-21T05:59:00Z'), ended: true }, 'quiet'],
    ['no evidence beyond old registration', null, 'quiet'],
  ] as const)('%s', (_name, evidence, kind) => {
    expect(externalRunActivity(run(), evidence, now).kind).toBe(kind);
  });

  it('treats a fresh registration as recent until an hour passes', () => {
    expect(externalRunActivity(run({ createdAt: '2026-10-21 05:59:00' }), null, now).kind).toBe(
      'recent',
    );
  });
});

describe('codexChildSession', () => {
  it('decodes the parent and child native sessions', () => {
    expect(codexChildSession(`codex-child:v1:${encode('parent1')}:${encode('child1')}`)).toEqual({
      parent: 'parent1',
      child: 'child1',
    });
    expect(codexChildSession('parent1')).toBeNull();
  });
});

describe('observeRunActivity', () => {
  it('bounds log observations while retaining every historical run', async () => {
    const root = await dialogueRoot();
    const logs = new SessionLogReader({ stateRoot: root });
    let active = 0;
    let maximum = 0;
    const writes = vi.spyOn(logs, 'lastWrittenAt').mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return null;
    });
    const runs = Array.from({ length: 20 }, (_, index) => run({ id: `run${index}` }));
    const observed = await observeRunActivity(directory(runs), logs, now);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(writes).toHaveBeenCalledTimes(20);
    expect(observed.runs).toHaveLength(20);
    expect(observed.runs.every((item) => item.activity.kind === 'quiet')).toBe(true);
  });

  it('revives a quiet direct session on its next dialogue write and leaves managed runs', async () => {
    const root = await dialogueRoot();
    const log = join(root, 'codex-dialogue', 'parent1.jsonl');
    await writeAt(log, record('reply', '2026-10-09T14:07:43Z'), '2026-10-09T14:07:43Z');
    const managed = run({ id: 'managed', ownership: null, mode: 'headless', session: null });
    expect(await activity(root, [run(), managed])).toEqual(['quiet', 'lifecycle']);

    await writeAt(log, record('file', '2026-10-21T05:59:00Z'), '2026-10-21T05:59:00Z');
    expect(await activity(root, [run(), managed])).toEqual(['recent', 'lifecycle']);
  });

  it('marks a session quiet once its latest record ends it, until it is resumed', async () => {
    const root = await dialogueRoot();
    const claude = run({ harness: 'claude', session: { provider: 'claude', session: 'c1' } });
    const log = join(root, 'claude-dialogue', 'c1.jsonl');
    expect(await activity(root, [claude])).toEqual(['quiet']);

    await writeAt(log, record('prompt', '2026-10-21T05:50:00Z'), '2026-10-21T05:50:00Z');
    expect(await activity(root, [claude])).toEqual(['recent']);
    await writeAt(log, record('session_end', '2026-10-21T05:55:00Z'), '2026-10-21T05:55:00Z');
    expect(await activity(root, [claude])).toEqual(['quiet']);
    await writeAt(log, record('prompt', '2026-10-21T05:58:00Z'), '2026-10-21T05:58:00Z');
    expect(await activity(root, [claude])).toEqual(['recent']);
  });

  it('revives a Codex child only from its own events in the parent log', async () => {
    const root = await dialogueRoot();
    const child = run({
      id: 'child',
      session: {
        provider: 'codex',
        session: `codex-child:v1:${encode('parent1')}:${encode('c1')}`,
      },
    });
    const log = join(root, 'codex-dialogue', 'parent1.jsonl');
    await writeAt(log, record('file', '2026-10-21T05:59:00Z'), '2026-10-21T05:59:00Z');
    expect(await activity(root, [child])).toEqual(['quiet']);

    await writeAt(log, record('file', '2026-10-21T05:59:30Z', 'c1'), '2026-10-21T05:59:30Z');
    expect(await activity(root, [child])).toEqual(['recent']);
  });

  it('ends a managed run only from its own top-level end recorded after it was registered', async () => {
    const root = await dialogueRoot();
    await mkdir(join(root, 'pi-dialogue'));
    const session = { provider: 'pi', session: '852523a8-ae2e-4097-a1f3-8bb18204b520' } as const;
    const managed = (change: Partial<AgentRun>) =>
      run({ harness: 'pi', mode: 'interactive', ownership: null, session, ...change });
    const live = managed({ id: 's62rjb', createdAt: '2026-08-28 15:17:19' });
    const stopped = managed({ id: 'hzjft', status: 'stopped', createdAt: '2026-08-28 15:03:06' });
    const log = join(root, 'pi-dialogue', `${session.session}.jsonl`);
    // Live managed run with no captured log: the lifecycle stands.
    expect(await activity(root, [live, stopped])).toEqual(['lifecycle', 'lifecycle']);

    await writeAt(log, record('prompt', '2026-08-28T15:20:00Z'), '2026-08-28T15:20:00Z');
    await writeAt(
      log,
      record('session_end', '2026-08-28T15:50:04.474Z', 'child'),
      '2026-08-28T15:50:04Z',
    );
    // Months of silence and a child's end leave a managed run live.
    expect(await activity(root, [live])).toEqual(['lifecycle']);

    await writeAt(log, record('session_end', '2026-08-28T15:50:04.474Z'), '2026-08-28T15:50:04Z');
    expect(await activity(root, [live, stopped])).toEqual(['quiet', 'lifecycle']);
    // A newer run on the same native session is not ended by the earlier end.
    expect(
      await activity(root, [managed({ id: 'newer', createdAt: '2026-10-21 05:00:00' })]),
    ).toEqual(['lifecycle']);

    await writeAt(log, record('prompt', '2026-10-21T05:58:00Z'), '2026-10-21T05:58:00Z');
    expect(await activity(root, [live])).toEqual(['lifecycle']);
  });
});
