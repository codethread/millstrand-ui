import { z } from 'zod';

export const providerSchema = z.enum(['pi', 'codex', 'claude']);
export type LogProvider = z.infer<typeof providerSchema>;
export const dialogueSchema = z.object({
  v: z.literal(1),
  event: z.enum(['prompt', 'reply', 'file', 'session_start', 'session_end']),
  ts: z.string(),
  session_id: z.string(),
  prompt_id: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  agent_id: z.string().nullable().optional(),
  agent_type: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  thinking_level: z.string().nullable().optional(),
  text: z.string().optional(),
  tool: z.string().optional(),
  file_path: z.string().nullable().optional(),
  command: z.string().nullable().optional(),
  reason: z.string().optional(),
});
export type DialogueRecord = z.infer<typeof dialogueSchema>;
export const logEventSchema = z.object({ id: z.string(), record: dialogueSchema });
export type LogEvent = z.infer<typeof logEventSchema>;
export const logSnapshotSchema = z.object({
  events: z.array(logEventSchema),
  skipped: z.number(),
  truncated: z.boolean(),
  bytes: z.number(),
  modifiedAt: z.string(),
});
export type LogSnapshot = z.infer<typeof logSnapshotSchema>;
