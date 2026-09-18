import { expect, it } from 'vitest';
import { parseSessionLogSource } from './session-logs';
import { logBindings } from './log-activity';

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
        attributes: {
          'identity/session': 'true',
          'identity/id': 'worker',
          'identity/harness': 'pi',
          'identity/native-session-id': 'native-123',
        },
      },
      {
        attributes: {
          'identity/session': 'true',
          'identity/id': 'unbound',
          'identity/harness': 'pi',
        },
      },
      { attributes: { owner: 'worker' } },
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
