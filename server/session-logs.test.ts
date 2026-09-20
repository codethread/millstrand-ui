import { expect, it } from 'vitest';
import type { LogProvider, LogSnapshot } from '../shared/session-log';
import { parseSessionLogSource } from './session-logs';
import { logBindings, readLogActivity } from './log-activity';
import { SessionLogReader } from './session-log-reader';

function identityRow(identity: string, nativeSession?: string) {
  return {
    id: `identity-${identity}`,
    title: identity,
    state: 'active',
    created_at: '2026-09-19 10:00:00',
    updated_at: '2026-09-19 10:00:00',
    attributes: {
      'identity/session': 'true',
      'identity/id': identity,
      'identity/harness': 'pi',
      ...(nativeSession ? { 'identity/native-session-id': nativeSession } : {}),
    },
  };
}
function runRow(identity: string, id: string, status: string, createdAt: string) {
  return {
    id,
    title: id,
    state: 'active',
    created_at: createdAt,
    updated_at: createdAt,
    attributes: {
      'harness/run': 'true',
      'harness/published': 'true',
      'harness/harness': 'pi',
      'harness/session-id': `session-${id}`,
      'harness/status': status,
      'harness/alias': 'tui',
      'harness/mode': 'headless',
      'identity/id': identity,
    },
  };
}
function graph(strands: ReturnType<typeof identityRow | typeof runRow>[]) {
  const identities = new Map(
    strands
      .filter((row) => (row.attributes as Record<string, string>)['identity/session'] === 'true')
      .map((row) => [(row.attributes as Record<string, string>)['identity/id'], row.id]),
  );
  return {
    strands,
    edges: strands.flatMap((row) => {
      const attributes = row.attributes as Record<string, string>;
      if (attributes['harness/run'] !== 'true') return [];
      const identity = identities.get(attributes['identity/id']);
      return identity
        ? [{ from_strand_id: identity, to_strand_id: row.id, edge_type: 'performed' }]
        : [];
    }),
  };
}

it.each(['pi', 'codex', 'claude'])('accepts canonical %s session requests', (provider) => {
  expect(
    parseSessionLogSource(
      new URL(`http://dashboard/api/session-logs/stream?provider=${provider}&session=session-123`),
    ),
  ).toEqual({ provider, session: 'session-123' });
});

it.each([
  '',
  '?provider=pi',
  '?provider=unknown&session=abc',
  '?provider=pi&session=..%2Foutside',
  '?provider=pi&session=%2Ftmp%2Foutside',
])('rejects invalid log source queries before opening an SSE response: %s', (query) => {
  expect(() =>
    parseSessionLogSource(new URL(`http://dashboard/api/session-logs/stream${query}`)),
  ).toThrow(expect.objectContaining({ status: 400 }));
});

it('resolves persisted native session bindings without guessing', () => {
  expect(
    logBindings(graph([identityRow('worker', 'native-123'), identityRow('unbound')])).map(
      ({ identity, identityStrandId, source }) => ({ identity, identityStrandId, source }),
    ),
  ).toEqual([
    {
      identity: 'worker',
      identityStrandId: 'identity-worker',
      source: { provider: 'pi', session: 'native-123' },
    },
    { identity: 'unbound', identityStrandId: 'identity-unbound', source: null },
  ]);
});

it('keeps duplicate friendly identities bound to their immutable identity strands', async () => {
  const first = identityRow('duplicate', 'native-first');
  const second = { ...identityRow('duplicate'), id: 'identity-duplicate-second' };
  const activeRun = runRow('duplicate', 'second-running', 'running', '2026-09-19 10:01:00');
  const snapshot = {
    strands: [first, second, activeRun],
    edges: [
      {
        from_strand_id: second.id,
        to_strand_id: activeRun.id,
        edge_type: 'performed',
      },
    ],
  };
  const reader = new (class extends SessionLogReader {
    readonly sessions: string[] = [];

    override snapshot(provider: LogProvider, session: string): Promise<LogSnapshot> {
      this.sessions.push(`${provider}/${session}`);
      return Promise.resolve({
        events: [],
        skipped: 0,
        truncated: false,
        bytes: 0,
        modifiedAt: '2026-09-19T10:02:00Z',
      });
    }
  })();

  const activity = await readLogActivity(snapshot, reader);

  expect(reader.sessions).toEqual(['pi/session-second-running']);
  expect(activity.bindings).toMatchObject([
    {
      identity: 'duplicate',
      identityStrandId: 'identity-duplicate',
      activity: { kind: 'idle' },
    },
    {
      identity: 'duplicate',
      identityStrandId: 'identity-duplicate-second',
      activity: { kind: 'available' },
    },
  ]);
});

it('uses the exact session recorded by a running performed run before native attachment', () => {
  expect(
    logBindings(
      graph([identityRow('worker'), runRow('worker', 'run-1', 'running', '2026-09-19 10:01:00')]),
    )[0]?.source,
  ).toEqual({ provider: 'pi', session: 'session-run-1' });
});

it('prefers a running run, then native identity linkage, then newest run history', () => {
  expect(
    logBindings(
      graph([
        identityRow('active', 'native-active'),
        runRow('active', 'old-running', 'running', '2026-09-19 10:01:00'),
        runRow('active', 'new-stopped', 'stopped', '2026-09-19 10:02:00'),
        identityRow('attached', 'native-attached'),
        runRow('attached', 'stopped', 'stopped', '2026-09-19 10:03:00'),
        identityRow('history'),
        runRow('history', 'old-ready', 'ready', '2026-09-19 10:04:00'),
        runRow('history', 'new-stopped', 'stopped', '2026-09-19 10:05:00'),
      ]),
    ).map(({ identity, source }) => ({ identity, source })),
  ).toEqual([
    { identity: 'active', source: { provider: 'pi', session: 'session-old-running' } },
    { identity: 'attached', source: { provider: 'pi', session: 'native-attached' } },
    { identity: 'history', source: { provider: 'pi', session: 'session-new-stopped' } },
  ]);
});
