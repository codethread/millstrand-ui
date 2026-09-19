import { expect, it } from 'vitest';
import { parseSessionLogSource } from './session-logs';
import { logBindings } from './log-activity';

function identityRow(identity: string, nativeSession?: string) {
  return {
    id: `identity-${identity}`,
    created_at: '2026-09-19 10:00:00',
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
    created_at: createdAt,
    attributes: {
      'harness/run': 'true',
      'harness/published': 'true',
      'harness/harness': 'pi',
      'harness/session-id': `session-${id}`,
      'harness/status': status,
      'identity/id': identity,
    },
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

it('resolves persisted native session bindings without guessing from identity or workspace names', () => {
  expect(
    logBindings([
      {
        id: 'identity-1',
        created_at: '2026-09-19 10:00:00',
        attributes: {
          'identity/session': 'true',
          'identity/id': 'worker',
          'identity/harness': 'pi',
          'identity/native-session-id': 'native-123',
        },
      },
      {
        id: 'identity-2',
        created_at: '2026-09-19 10:00:00',
        attributes: {
          'identity/session': 'true',
          'identity/id': 'unbound',
          'identity/harness': 'pi',
        },
      },
      {
        id: 'owned-work',
        created_at: '2026-09-19 10:00:00',
        attributes: { owner: 'worker' },
      },
    ]),
  ).toEqual([
    {
      identity: 'worker',
      source: { provider: 'pi', session: 'native-123' },
      activity: { kind: 'idle' },
    },
    { identity: 'unbound', source: null, activity: { kind: 'idle' } },
  ]);
});

it('uses the exact session recorded by a running published run before identity attachment', () => {
  expect(
    logBindings([
      {
        id: 'identity-1',
        created_at: '2026-09-19 10:00:00',
        attributes: {
          'identity/session': 'true',
          'identity/id': 'worker',
          'identity/harness': 'pi',
        },
      },
      {
        id: 'run-1',
        created_at: '2026-09-19 10:01:00',
        attributes: {
          'harness/run': 'true',
          'harness/published': 'true',
          'harness/harness': 'pi',
          'harness/session-id': 'session-123',
          'harness/status': 'running',
          'identity/id': 'worker',
        },
      },
    ]),
  ).toEqual([
    {
      identity: 'worker',
      source: { provider: 'pi', session: 'session-123' },
      activity: { kind: 'idle' },
    },
  ]);
});

it('prefers a running run, then native identity linkage, then newest run history', () => {
  expect(
    logBindings([
      identityRow('active', 'native-active'),
      runRow('active', 'old-running', 'running', '2026-09-19 10:01:00'),
      runRow('active', 'new-stopped', 'stopped', '2026-09-19 10:02:00'),
      identityRow('attached', 'native-attached'),
      runRow('attached', 'stopped', 'stopped', '2026-09-19 10:03:00'),
      identityRow('history'),
      runRow('history', 'old-ready', 'ready', '2026-09-19 10:04:00'),
      runRow('history', 'new-stopped', 'stopped', '2026-09-19 10:05:00'),
    ]).map(({ identity, source }) => ({ identity, source })),
  ).toEqual([
    { identity: 'active', source: { provider: 'pi', session: 'session-old-running' } },
    { identity: 'attached', source: { provider: 'pi', session: 'native-attached' } },
    { identity: 'history', source: { provider: 'pi', session: 'session-new-stopped' } },
  ]);
});
