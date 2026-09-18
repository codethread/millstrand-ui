import type { DialogueRecord, LogEvent } from '../../shared/log-lab';

export function eventText(record: DialogueRecord): string {
  return (
    record.text ??
    record.command ??
    record.file_path ??
    record.reason ??
    record.event.replaceAll('_', ' ')
  );
}
export function eventLabel(record: DialogueRecord): string {
  if (record.event === 'prompt') return 'You';
  if (record.event === 'reply') return 'Assistant';
  if (record.event === 'file') return record.tool ?? 'Tool';
  return record.event.replaceAll('_', ' ');
}
export function filterEvents(events: LogEvent[], query: string, kind: string): LogEvent[] {
  const needle = query.toLowerCase();
  return events.filter(
    ({ record }) =>
      (kind === 'all' || record.event === kind) &&
      `${eventText(record)} ${eventLabel(record)}`.toLowerCase().includes(needle),
  );
}
export type ConversationBlock =
  { kind: 'message'; event: LogEvent } | { kind: 'tools'; events: LogEvent[] };
export function conversationBlocks(events: LogEvent[]): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  for (const event of events) {
    const last = blocks.at(-1);
    if (event.record.event === 'file') {
      if (last?.kind === 'tools') last.events.push(event);
      else blocks.push({ kind: 'tools', events: [event] });
    } else blocks.push({ kind: 'message', event });
  }
  return blocks;
}
export function clock(ts: string): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
