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
export const logSessionSchema = z.object({
  id: z.string(),
  provider: providerSchema,
  title: z.string(),
  cwd: z.string().nullable(),
  model: z.string().nullable(),
  modifiedAt: z.string(),
  bytes: z.number(),
});
export type LogSession = z.infer<typeof logSessionSchema>;
export const logDirectorySchema = z.object({
  sessions: z.array(logSessionSchema),
  warnings: z.array(z.string()),
});
export type LogDirectory = z.infer<typeof logDirectorySchema>;
export const concepts = {
  console: {
    number: '01',
    title: 'Console',
    subtitle: 'Every event. Nothing between you and the work.',
    port: 4311,
  },
  conversation: {
    number: '02',
    title: 'Conversation',
    subtitle: 'The story of a session, with the noise tucked away.',
    port: 4312,
  },
  inspector: {
    number: '03',
    title: 'Activity inspector',
    subtitle: 'Follow the work. Inspect the evidence.',
    port: 4313,
  },
};
export type Concept = keyof typeof concepts;
export const conceptSchema = z.enum(['console', 'conversation', 'inspector']);
