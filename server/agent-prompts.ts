import type { AgentOption, AgentPrompt, AgentReply } from '../shared/api.ts';
import type { ReviewDetail } from '../shared/reviews.ts';
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

const agentOptionSchema = z
  .object({
    kind: z.enum(['harness', 'alias']),
    name: z.string(),
    resolution: z.string(),
    provider: z.string(),
    modes: z.array(z.enum(['headless', 'interactive'])).optional(),
    description: z.string().optional(),
    model: z.string().optional(),
    thinking: z.string().optional(),
  })
  .loose();
const compiledAgentOptionsSchema = z.compile(z.array(agentOptionSchema), { strict: true });

const agentPromptSchema = z
  .object({
    targetId: z.string(),
    targetKind: z.enum(['review', 'review-comment']).optional(),
    comment: promptCommentSchema.optional(),
    alias: z.string(),
    prompt: z.string(),
    requestId: z.string(),
  })
  .strict();
const compiledAgentPromptSchema = z.compile(agentPromptSchema, { strict: true });

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

export function parseAgentOptions(value: unknown): AgentOption[] {
  const parsed = compiledAgentOptionsSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`available agents are invalid: ${z.prettifyError(parsed.error)}`);
  const rows = parsed.data;
  const headless = new Set(
    rows
      .filter((row) => row.kind === 'harness')
      .filter((row) => row.modes?.includes('headless') === true)
      .map((row) => row.name),
  );
  return rows
    .filter((row) => headless.has(row.provider))
    .map((row) => ({
      name: row.name,
      description: row.description ?? null,
      model: row.model ?? null,
    }));
}

function boundedString(value: unknown, where: string, max: number): string {
  const text = string(value, where).trim();
  if (!text || text.length > max || text.includes('\0'))
    throw new Error(`${where} must contain 1–${max} characters and no null bytes.`);
  return text;
}

export function parseAgentPrompt(value: unknown): AgentPrompt {
  const parsed = compiledAgentPromptSchema.safeParse(value);
  if (!parsed.success) throw new Error('Unsupported agent prompt field.');
  const row = parsed.data;
  if (row.targetKind !== 'review-comment' && row.comment !== undefined)
    throw new Error('Unexpected comment reference');
  const targetId = boundedString(row.targetId, 'Target', 100);
  const alias = boundedString(row.alias, 'Agent alias', 100);
  const requestId = boundedString(row.requestId, 'Request ID', 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(targetId)) throw new Error('Invalid target ID.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(alias)) throw new Error('Invalid agent alias.');
  if (!/^ui-[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw new Error('Invalid request ID.');
  const prompt = boundedString(row.prompt, 'Prompt', 12000);
  if (row.targetKind === 'review-comment') {
    const comment = row.comment;
    if (comment === undefined) throw new Error('Invalid comment reference');
    const id = boundedString(comment.id, 'Comment ID', 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid comment reference');
    return {
      targetId,
      alias,
      requestId,
      prompt,
      targetKind: 'review-comment',
      comment: {
        id,
        revision: boundedString(comment.revision, 'Review revision', 500),
        candidateVersion: candidateVersion(comment.candidateVersion),
      },
    };
  }
  return {
    targetId,
    alias,
    requestId,
    prompt,
    ...(row.targetKind === 'review' ? { targetKind: 'review' as const } : {}),
  };
}

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

export function reviewPromptContext(review: ReviewDetail, workspace: string): string {
  return [
    'Review context (metadata at dispatch; inspect the Strand for authoritative evidence):',
    `Review Strand: ${review.id} · ${review.title}`,
    'Kind: merge-request review',
    `State: ${review.state}; stage: ${review.stage}; decision: ${review.decision}; current at last poll: ${review.current}`,
    `Repository: ${review.repo ?? 'unavailable'}`,
    `Merge request: ${review.mr.iid ?? 'unavailable'}; URL: ${review.mr.url ?? 'unavailable'}`,
    `Revision: ${review.mr.sha ?? 'unavailable'}; base: ${review.mr.baseSha ?? 'unavailable'}`,
    `Branches: ${review.mr.sourceBranch ?? 'unavailable'} → ${review.mr.targetBranch ?? 'unavailable'}`,
    `Weaver: ${workspace}`,
    `Review worktree: ${review.worktree ?? 'not recorded; inspect the review Strand for artifact locations'}`,
    `Inspect strand show ${review.id} and strand review show ${review.id} in this weaver for the authoritative review, report, reviewer runs, notes, and artifact references. Inspect those artifacts directly; refresh review state before acting.`,
  ].join('\n');
}

export function agentLaunchArgs(
  workspace: string,
  cwd: string,
  cardId: string,
  input: AgentPrompt,
  reviewContext: string | null = null,
): string[] {
  return [
    'agent',
    'run',
    input.alias,
    '--prompt',
    `You are responding to a dashboard prompt about strand ${input.targetId} in the weaver at ${workspace}. Inspect that strand with strand show ${input.targetId} as needed. Keep your work within the user's request.${reviewContext === null ? '' : `\n\n${reviewContext}`}\n\nUser prompt:\n${input.prompt}`,
    '--cwd',
    cwd,
    '--target',
    input.targetId,
    '--title',
    `${input.targetId} · ${input.prompt.slice(0, 100)}`,
    '--context',
    JSON.stringify({
      source: 'millstrand-ui',
      card: cardId,
      target: input.targetId,
      prompt: input.prompt,
      ...(reviewContext === null
        ? {}
        : { targetKind: input.targetKind ?? 'review', reviewContext }),
      ...(input.targetKind === 'review-comment' ? { comment: input.comment } : {}),
    }),
    '--request-id',
    input.requestId,
  ];
}
