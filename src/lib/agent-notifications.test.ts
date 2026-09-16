import { describe, expect, it } from 'vitest';
import { promptedRuns } from './agent-notifications';
import { parseAgents } from '../../server/agents';

const requestId = 'ui-0123456789abcdef';
function agents(status: string, request: string | null = requestId) {
  return parseAgents([
    {
      id: 'identity',
      title: 'Tiger',
      state: 'active',
      created_at: '2026-09-14',
      updated_at: '2026-09-14',
      attributes: { 'identity/session': 'true', 'identity/id': 'tiger', 'identity/harness': 'pi' },
    },
    ...['prompt-run', 'workflow-run'].map((id) => ({
      id,
      title: id,
      state: 'active',
      created_at: '2026-09-14',
      updated_at: '2026-09-14',
      attributes: {
        'harness/run': 'true',
        'harness/published': 'true',
        'identity/id': 'tiger',
        'harness/alias': 'tui',
        'harness/harness': 'pi',
        'harness/mode': 'headless',
        'harness/status': status,
        'harness/request-id': request,
      },
    })),
  ]);
}
const receipts = { 'prompt-run': { requestId, read: false } };

describe('UI prompt notifications', () => {
  it('excludes workflow/terminal/desktop runs without a matching local launch receipt', () => {
    expect(promptedRuns(agents('running'), receipts).map((item) => item.run.id)).toEqual([
      'prompt-run',
    ]);
    expect(promptedRuns(agents('running', 'terminal-request'), receipts)).toEqual([]);
    expect(promptedRuns(agents('running'), {})).toEqual([]);
  });
  it.each(['ready', 'running'])('does not notify for %s runs', (status) => {
    expect(promptedRuns(agents(status), receipts)[0]?.unread).toBe(false);
  });
  it('rejects a changed upstream run-status contract', () => {
    expect(() => agents('unknown')).toThrow('harness/status');
  });
  it.each(['stopped', 'failed'])(
    'notifies once for finished %s runs and preserves the exact identity/run destination',
    (status) => {
      expect(promptedRuns(agents(status), receipts)[0]).toMatchObject({
        identity: 'tiger',
        run: { id: 'prompt-run' },
        unread: true,
      });
      expect(
        promptedRuns(agents(status), { 'prompt-run': { requestId, read: true } })[0]?.unread,
      ).toBe(false);
    },
  );
});
