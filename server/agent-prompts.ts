import type { AgentOption, AgentPrompt, AgentReply, AgentRunStatus } from '../shared/api.ts';
import type { ReviewDetail } from '../shared/reviews.ts';
import { reviewVersion } from './review-comments.ts';
import { array, maybeString, object, string } from './parse.ts';

export function parseAgentOptions(value: unknown): AgentOption[] {
  const rows = array(value, 'available agents').map((entry) => object(entry, 'agent'));
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
  const row = object(value, 'agent prompt');
  if (
    Object.keys(row).some(
      (key) => !['targetId', 'targetKind', 'comment', 'alias', 'prompt', 'requestId'].includes(key),
    )
  )
    throw new Error('Unsupported agent prompt field.');
  if (
    row['targetKind'] !== undefined &&
    row['targetKind'] !== 'review' &&
    row['targetKind'] !== 'review-comment'
  )
    throw new Error('Unsupported prompt target kind.');
  if (row['targetKind'] !== 'review-comment' && row['comment'] !== undefined)
    throw new Error('Unexpected comment reference');
  const targetId = boundedString(row['targetId'], 'Target', 100);
  const alias = boundedString(row['alias'], 'Agent alias', 100);
  const requestId = boundedString(row['requestId'], 'Request ID', 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(targetId)) throw new Error('Invalid target ID.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(alias)) throw new Error('Invalid agent alias.');
  if (!/^ui-[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw new Error('Invalid request ID.');
  const prompt = boundedString(row['prompt'], 'Prompt', 12000);
  if (row['targetKind'] === 'review-comment') {
    const comment = object(row['comment'], 'Comment reference');
    const id = boundedString(comment['id'], 'Comment ID', 100);
    if (
      !/^[a-zA-Z0-9_-]+$/.test(id) ||
      Object.keys(comment).some((key) => !['id', 'revision', 'candidateVersion'].includes(key))
    )
      throw new Error('Invalid comment reference');
    return {
      targetId,
      alias,
      requestId,
      prompt,
      targetKind: 'review-comment',
      comment: {
        id,
        revision: boundedString(comment['revision'], 'Review revision', 500),
        candidateVersion: reviewVersion(comment['candidateVersion']),
      },
    };
  }
  return {
    targetId,
    alias,
    requestId,
    prompt,
    ...(row['targetKind'] === 'review' ? { targetKind: 'review' as const } : {}),
  };
}

export function parseAgentReply(value: unknown): AgentReply {
  const row = object(value, 'agent run');
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
  const context = object(value, 'run context');
  if (context['source'] !== 'millstrand-ui') return null;
  if (context['targetKind'] === 'review-comment') {
    const reference = object(context['comment'], 'Prompt comment');
    return {
      kind: 'review-comment',
      cardId: string(context['card'], 'prompt.card'),
      text: string(context['prompt'], 'prompt.text'),
      context: string(context['reviewContext'], 'prompt.reviewContext'),
      comment: {
        id: string(reference['id'], 'Comment ID'),
        revision: string(reference['revision'], 'Revision'),
        candidateVersion: reviewVersion(reference['candidateVersion']),
      },
    };
  }
  return {
    cardId: string(context['card'], 'prompt.card'),
    text: string(context['prompt'], 'prompt.text'),
    ...(context['targetKind'] === 'review'
      ? {
          kind: 'review' as const,
          context: string(context['reviewContext'], 'prompt.reviewContext'),
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
