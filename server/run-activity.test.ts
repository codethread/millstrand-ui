import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentDirectory, AgentRun } from '../shared/api.ts';
import { externalRunActivity, observeRunActivity } from './run-activity.ts';
import { SessionLogReader } from './session-log-reader.ts';

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
    session: { provider: 'codex', session: 'session1' },
    continuation: null,
    createdAt: '2026-10-09 12:14:16',
    startedAt: null,
    finishedAt: null,
    activity: { kind: 'lifecycle' },
    ...change,
  };
}

describe('externalRunActivity', () => {
  it('uses the latest of registration and dialogue writes', () => {
    expect(externalRunActivity(run(), new Date('2026-10-09T14:07:43Z'), now)).toEqual({
      kind: 'quiet',
      lastActivityAt: '2026-10-09T14:07:43.000Z',
    });
    expect(externalRunActivity(run(), new Date('2026-10-21T05:30:00Z'), now)).toEqual({
      kind: 'recent',
      lastActivityAt: '2026-10-21T05:30:00.000Z',
    });
    expect(externalRunActivity(run({ createdAt: '2026-10-21 05:59:00' }), null, now).kind).toBe(
      'recent',
    );
  });
});

describe('observeRunActivity', () => {
  it('marks stale external sessions quiet, revives them on a new write and leaves managed runs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'run-activity-'));
    roots.push(root);
    await mkdir(join(root, 'codex-dialogue'));
    const log = join(root, 'codex-dialogue', 'session1.jsonl');
    await writeFile(log, '');
    await utimes(log, new Date('2026-10-09T14:07:43Z'), new Date('2026-10-09T14:07:43Z'));
    const external = run();
    const managed = run({ id: 'managed', ownership: null, mode: 'headless', session: null });
    const directory: AgentDirectory = {
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
          createdAt: external.createdAt,
          runs: [external],
          work: [],
        },
      ],
      runs: [external, managed],
    };
    const logs = new SessionLogReader({ stateRoot: root });

    const stale = await observeRunActivity(directory, logs, now);
    expect(stale.identities[0]!.runs[0]!.activity.kind).toBe('quiet');
    expect(stale.runs[1]!.activity).toEqual({ kind: 'lifecycle' });

    await utimes(log, new Date('2026-10-21T05:59:00Z'), new Date('2026-10-21T05:59:00Z'));
    const resumed = await observeRunActivity(directory, logs, now);
    expect(resumed.identities[0]!.runs[0]!.activity).toEqual({
      kind: 'recent',
      lastActivityAt: '2026-10-21T05:59:00.000Z',
    });
  });
});
