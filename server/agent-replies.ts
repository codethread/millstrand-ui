import type { AgentReply } from '../shared/api.ts';
import { candidateVersion } from './review-comments.ts';
import { string } from './parse.ts';
import { z } from 'zod';

const runStatusSchema = z.enum(['ready', 'running', 'stopped', 'failed']);
const runSubstatusSchema = z
  .enum([
    'pending',
    'completed',
    'requested',
    'abandoned',
    'bootstrap',
    'launch',
    'execution',
    'reconciliation',
  ])
  .nullable();
const promptCommentSchema = z
  .object({
    id: z.string(),
    revision: z.string(),
    candidateVersion: z.number().int().safe().min(1),
  })
  .strict();

const agentReplySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    state: z.enum(['active', 'closed', 'replaced']),
    alias: z.string(),
    harness: z.string(),
    mode: z.enum(['headless', 'interactive']),
    status: runStatusSchema,
    substatus: runSubstatusSchema,
    'session-id': z.string(),
    settled: z.boolean(),
    identity: z.string().optional(),
    target: z.string().optional(),
    'request-id': z.string().optional(),
    result: z.string().optional(),
    error: z.string().optional(),
    'updated-at': z.string().optional(),
    'exit-code': z.number().int().optional(),
    resumable: z.boolean().optional(),
    'resume-reason': z.string().optional(),
  })
  .loose();
const compiledAgentReplySchema = z.compile(agentReplySchema, { strict: true });

const promptContextSchema = z
  .object({
    source: z.string().optional(),
    targetKind: z.enum(['review', 'review-comment']).optional(),
    comment: promptCommentSchema.optional(),
    card: z.string().optional(),
    target: z.string().optional(),
    prompt: z.string().optional(),
    reviewContext: z.string().optional(),
  })
  .loose();
const compiledPromptContextSchema = z.compile(promptContextSchema, { strict: true });

export function parseAgentReply(value: unknown): AgentReply {
  const parsed = compiledAgentReplySchema.safeParse(value);
  if (!parsed.success) throw new Error(`agent run is invalid: ${z.prettifyError(parsed.error)}`);
  const row = parsed.data;
  const error = row.error ?? null;
  return {
    id: row.id,
    title: row.title,
    alias: row.alias,
    identity: row.identity ?? null,
    target: row.target ?? null,
    status: row.status,
    substatus: row.substatus,
    result: row.result ?? null,
    prompt: null,
    // Harness errors can embed entire JSONL transcripts, prompts, and tool output.
    // Return the diagnosis only, never arbitrary provider log content.
    error:
      error === null
        ? null
        : error.startsWith('Pi produced truncated JSONL')
          ? 'Pi produced truncated JSONL. The run was marked failed; any available reply is shown below.'
          : 'The harness reported an execution error. Inspect this run with strand agent show for details.',
  };
}

export function parsePromptContext(value: unknown): AgentReply['prompt'] {
  if (value === undefined || value === null) return null;
  const parsed = compiledPromptContextSchema.safeParse(value);
  if (!parsed.success) throw new Error(`run context is invalid: ${z.prettifyError(parsed.error)}`);
  const context = parsed.data;
  if (context['source'] !== 'millstrand-ui') return null;
  if (context.targetKind === 'review-comment') {
    const reference = context.comment;
    if (reference === undefined) throw new Error('Prompt comment must be an object');
    return {
      kind: 'review-comment',
      cardId: string(context.card, 'prompt.card'),
      text: string(context.prompt, 'prompt.text'),
      context: string(context.reviewContext, 'prompt.reviewContext'),
      comment: {
        id: string(reference.id, 'Comment ID'),
        revision: string(reference.revision, 'Revision'),
        candidateVersion: candidateVersion(reference.candidateVersion),
      },
    };
  }
  return {
    cardId: string(context.card, 'prompt.card'),
    text: string(context.prompt, 'prompt.text'),
    ...(context.targetKind === 'review'
      ? {
          kind: 'review' as const,
          context: string(context.reviewContext, 'prompt.reviewContext'),
        }
      : { kind: 'card' as const }),
  };
}
