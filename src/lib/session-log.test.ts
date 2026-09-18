import { describe, expect, it } from 'vitest';
import type { LogEvent } from '../../shared/session-log';
import { conversationBlocks, filterEvents } from './session-log';

const events: LogEvent[] = [
  {
    id: '0',
    record: {
      v: 1,
      event: 'prompt',
      ts: '2026-09-18T00:00:00Z',
      session_id: 's',
      text: 'Check the files',
    },
  },
  {
    id: '100',
    record: {
      v: 1,
      event: 'file',
      ts: '2026-09-18T00:00:01Z',
      session_id: 's',
      tool: 'Read',
      file_path: '/src/a.ts',
    },
  },
  {
    id: '200',
    record: {
      v: 1,
      event: 'file',
      ts: '2026-09-18T00:00:02Z',
      session_id: 's',
      tool: 'Bash',
      command: 'pnpm test',
    },
  },
  {
    id: '300',
    record: {
      v: 1,
      event: 'reply',
      ts: '2026-09-18T00:00:03Z',
      session_id: 's',
      text: 'Files checked',
    },
  },
];
describe('log presentation', () => {
  it('folds only adjacent tool events without hiding or reordering the conversation', () => {
    expect(conversationBlocks(events)).toEqual([
      { kind: 'message', event: events[0] },
      { kind: 'tools', events: [events[1], events[2]] },
      { kind: 'message', event: events[3] },
    ]);
    expect(events).toHaveLength(4);
  });
  it('searches commands and paths case-insensitively while applying event filters', () => {
    expect(filterEvents(events, 'PNPM', 'file').map((e) => e.id)).toEqual(['200']);
    expect(filterEvents(events, '/SRC/', 'all').map((e) => e.id)).toEqual(['100']);
    expect(filterEvents(events, 'files', 'reply').map((e) => e.id)).toEqual(['300']);
    expect(filterEvents(events, 'pnpm', 'reply')).toEqual([]);
  });
});
