import { z } from 'zod';
import { logEventSchema, providerSchema } from './session-log.ts';

export const logSourceSchema = z.object({ provider: providerSchema, session: z.string() });
export type LogSource = z.infer<typeof logSourceSchema>;
export const logBindingSchema = z.object({
  identity: z.string(),
  identityStrandId: z.string(),
  source: logSourceSchema.nullable(),
  activity: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('idle') }),
    z.object({
      kind: z.literal('available'),
      latest: logEventSchema.nullable(),
      modifiedAt: z.string(),
    }),
    z.object({ kind: z.literal('unavailable'), message: z.string() }),
  ]),
});
export type LogBinding = z.infer<typeof logBindingSchema>;
export const logActivitySchema = z.object({ bindings: z.array(logBindingSchema) });
export type LogActivity = z.infer<typeof logActivitySchema>;
