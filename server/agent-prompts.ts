import type { AgentOption, AgentPrompt, AgentReply, AgentRunStatus } from '../shared/api.ts';
import type { ReviewDetail } from '../shared/reviews.ts';
import { candidateVersion } from './review-comments.ts';
import { array, maybeString, string } from './parse.ts';
import { z } from 'zod';

const agentOptionSchema = z
  .object({
    kind: z.unknown().optional(),
    name: z.unknown().optional(),
    provider: z.unknown().optional(),
    modes: z.unknown().optional(),
    description: z.unknown().optional(),
    model: z.unknown().optional(),
  })
  .loose();
const compiledAgentOptionsSchema = z.compile(z.array(agentOptionSchema), { strict: true });

const agentPromptSchema = z
  .object({
    targetId: z.unknown(),
    targetKind: z.enum(['review', 'review-comment']).optional(),
    comment: z.unknown().optional(),
    alias: z.unknown(),
    prompt: z.unknown(),
    requestId: z.unknown(),
  })
  .strict();
const compiledAgentPromptSchema = z.compile(agentPromptSchema, { strict: true });
const promptCommentSchema = z
  .object({ id: z.unknown(), revision: z.unknown(), candidateVersion: z.unknown() })
  .strict();
const compiledPromptCommentSchema = z.compile(promptCommentSchema, { strict: true });

const agentReplySchema = z
  .object({
    id: z.unknown(),
    title: z.unknown(),
    alias: z.unknown(),
    identity: z.unknown().optional(),
    target: z.unknown().optional(),
    status: z.unknown().optional(),
    substatus: z.unknown().optional(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
  })
  .loose();
const compiledAgentReplySchema = z.compile(agentReplySchema, { strict: true });

const promptContextCommentSchema = z
  .object({
    id: z.unknown().optional(),
    revision: z.unknown().optional(),
    candidateVersion: z.unknown().optional(),
  })
  .loose();
const promptContextSchema = z
  .object({
    source: z.unknown().optional(),
    targetKind: z.unknown().optional(),
    comment: z.unknown().optional(),
    card: z.unknown().optional(),
    prompt: z.unknown().optional(),
    reviewContext: z.unknown().optional(),
  })
  .loose();
const compiledPromptContextSchema = z.compile(promptContextSchema, { strict: true });

export function parseAgentOptions(value: unknown): AgentOption[] {
  const parsed = compiledAgentOptionsSchema.safeParse(value);
  if (!parsed.success) throw new Error('available agents must be an array');
  const rows = parsed.data;
  const headless = new Set(
    rows
      .filter((row) => row['kind'] === 'harness')
      .filter((row) => array(row['modes'], 'agent.modes').includes('headless'))
      .map((row) => string(row['name'], 'agent.name')),
  );
  return rows
    .filter((row) => headless.has(string(row['provider'], 'agent.provider')))
    .map((row) => ({
      name: string(row['name'], 'agent.name'),
      description: maybeString(row['description'], 'agent.description'),
      model: maybeString(row['model'], 'agent.model'),
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
    const comment = compiledPromptCommentSchema.safeParse(row.comment);
    if (!comment.success) throw new Error('Invalid comment reference');
    const id = boundedString(comment.data.id, 'Comment ID', 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid comment reference');
    return {
      targetId,
      alias,
      requestId,
      prompt,
      targetKind: 'review-comment',
      comment: {
        id,
        revision: boundedString(comment.data.revision, 'Review revision', 500),
        candidateVersion: candidateVersion(comment.data.candidateVersion),
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
  if (!parsed.success) throw new Error('agent run must be an object');
  const row = parsed.data;
  const statuses: AgentRunStatus[] = ['ready', 'running', 'stopped', 'failed'];
  const error = maybeString(row['error'], 'run.error');
  return {
    id: string(row['id'], 'run.id'),
    title: string(row['title'], 'run.title'),
    alias: string(row['alias'], 'run.alias'),
    identity: maybeString(row['identity'], 'run.identity'),
    target: maybeString(row['target'], 'run.target'),
    status: statuses.find((status) => status === row['status']) ?? 'unknown',
    substatus: maybeString(row['substatus'], 'run.substatus'),
    result: maybeString(row['result'], 'run.result'),
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
  if (!parsed.success) throw new Error('run context must be an object');
  const context = parsed.data;
  if (context['source'] !== 'millstrand-ui') return null;
  if (context.targetKind === 'review-comment') {
    const referenceResult = promptContextCommentSchema.safeParse(context.comment);
    if (!referenceResult.success) throw new Error('Prompt comment must be an object');
    const reference = referenceResult.data;
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
