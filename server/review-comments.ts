import type {
  CurateReview,
  ReviewComments,
  ReviewCommentPosition,
  ReviewCommentSide,
  PublishReview,
  ReviewPublicationReceipt,
  CommentPublicationState,
  ReviewPublicationState,
} from '../shared/review-comments.ts';
import { maybeString, string } from './parse.ts';
import { z } from 'zod';

const nonnegativeVersionInputSchema = z.number().int().safe().min(0);
const positiveVersionInputSchema = z.number().int().safe().min(1);
const positiveLineInputSchema = z.number().int().safe().min(1);
const nullableStringSchema = z.string().nullable().optional();
const inclusionSchema = z.enum(['included', 'dismissed']);
const commentPublicationStateSchema = z.enum([
  'unpublished',
  'publishing',
  'reconciling',
  'published',
  'excluded',
  'failed',
]);
const reviewPublicationStateSchema = z.enum([
  'unpublished',
  'publishing',
  'published',
  'partial',
  'failed',
]);
const publicationOutcomeSchema = z.enum(['published', 'partial', 'failed']);
const sideSchema = z.enum(['old', 'new']);
const compiledNonnegativeVersionSchema = z.compile(nonnegativeVersionInputSchema, { strict: true });
const compiledPositiveVersionSchema = z.compile(positiveVersionInputSchema, { strict: true });
const compiledPositiveLineSchema = z.compile(positiveLineInputSchema, { strict: true });
const compiledBooleanSchema = z.compile(z.boolean(), { strict: true });

const publishReviewInputSchema = z
  .object({ revision: z.string(), curationVersion: nonnegativeVersionInputSchema })
  .strict();
const compiledPublishReviewSchema = z.compile(publishReviewInputSchema, { strict: true });
const curationCandidateInputSchema = z
  .object({ expectedVersion: positiveVersionInputSchema, text: z.string() })
  .strict();
const curationChangeInputSchema = z
  .object({
    id: z.string(),
    inclusion: inclusionSchema,
    candidate: curationCandidateInputSchema.optional(),
  })
  .strict();
const curationReviewInputSchema = z
  .object({
    revision: z.string(),
    expectedVersion: nonnegativeVersionInputSchema,
    by: z.string(),
    changes: z.array(curationChangeInputSchema),
  })
  .strict();
const compiledCurationReviewSchema = z.compile(curationReviewInputSchema, { strict: true });

const commentPositionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('general'), reason: z.string() }).loose(),
  z.object({ kind: z.literal('unsupported'), reason: z.string() }).loose(),
  z
    .object({
      kind: z.literal('line'),
      oldPath: z.string(),
      newPath: z.string(),
      side: sideSchema,
      line: positiveLineInputSchema,
      startSide: sideSchema.nullable().optional(),
      startLine: positiveLineInputSchema.nullable().optional(),
    })
    .loose(),
]);
const compiledCommentPositionSchema = z.compile(commentPositionInputSchema, { strict: true });

const publicationReceiptCommentSchema = z
  .object({
    id: z.string(),
    state: commentPublicationStateSchema,
    retryable: z.boolean(),
    discussionId: nullableStringSchema,
    error: nullableStringSchema,
  })
  .loose();
const publicationReceiptSchema = z
  .object({
    reviewId: z.string(),
    revision: z.string(),
    curationVersion: nonnegativeVersionInputSchema,
    state: publicationOutcomeSchema,
    comments: z.array(publicationReceiptCommentSchema),
  })
  .loose();
const compiledPublicationReceiptSchema = z.compile(publicationReceiptSchema, { strict: true });

const reviewCommentsMrSchema = z
  .object({
    projectId: positiveLineInputSchema,
    iid: positiveLineInputSchema,
    url: z.string(),
    headSha: z.string(),
    baseSha: z.string(),
    startSha: z.string(),
    sourceBranch: nullableStringSchema,
    targetBranch: nullableStringSchema,
  })
  .loose();
const reviewCommentsCurationSchema = z
  .object({ version: nonnegativeVersionInputSchema, mutable: z.boolean() })
  .loose();
const reviewCommentsPublicationSchema = z
  .object({
    state: reviewPublicationStateSchema,
    published: nonnegativeVersionInputSchema,
    failed: nonnegativeVersionInputSchema,
  })
  .loose();
const reviewCommentsReviewSchema = z
  .object({
    id: z.string(),
    revision: z.string(),
    state: z.string(),
    stage: z.enum(['preparing', 'dispatching', 'running', 'reviewed', 'failed']),
    current: z.boolean(),
    decision: z.enum(['pending', 'done', 'dismissed']),
    repo: nullableStringSchema,
    mr: reviewCommentsMrSchema,
    curation: reviewCommentsCurationSchema,
    publication: reviewCommentsPublicationSchema,
  })
  .loose();

const reviewerCandidateSourceSchema = z
  .object({
    kind: z.literal('reviewer'),
    reviewer: z.string(),
    runId: nullableStringSchema,
  })
  .loose();
const adoptedCandidateSourceSchema = z
  .object({
    kind: z.literal('user-adopted'),
    by: z.string(),
    at: z.string(),
  })
  .loose();
const candidateSourceSchema = z.discriminatedUnion('kind', [
  reviewerCandidateSourceSchema,
  adoptedCandidateSourceSchema,
]);
const reviewCommentCandidateSchema = z
  .object({
    text: z.string(),
    version: positiveVersionInputSchema,
    source: candidateSourceSchema,
    original: z
      .object({
        text: z.string(),
        reviewer: z.string(),
        runId: nullableStringSchema,
      })
      .loose(),
  })
  .loose();
const reviewCommentPublicationSchema = z
  .object({
    state: commentPublicationStateSchema,
    discussionId: nullableStringSchema,
    retryable: z.boolean(),
    error: nullableStringSchema,
  })
  .loose();
const reviewCommentSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    severity: nullableStringSchema,
    category: z.string(),
    inclusion: inclusionSchema,
    candidate: reviewCommentCandidateSchema,
    position: commentPositionInputSchema,
    publication: reviewCommentPublicationSchema,
  })
  .loose();
const reviewCommentsSchema = z
  .object({
    review: reviewCommentsReviewSchema,
    comments: z.array(reviewCommentSchema),
  })
  .loose();
const compiledReviewCommentsSchema = z.compile(reviewCommentsSchema, { strict: true });

function nonblank(value: unknown, field: string): string {
  const text = string(value, field);
  if (!text.trim()) throw new Error(`${field} must not be blank`);
  return text;
}

export function reviewVersion(value: unknown): number {
  const parsed = compiledNonnegativeVersionSchema.safeParse(value);
  if (!parsed.success) throw new Error('Review version must be a nonnegative safe integer');
  return parsed.data;
}

export function candidateVersion(value: unknown): number {
  const parsed = compiledPositiveVersionSchema.safeParse(value);
  if (!parsed.success) throw new Error('Candidate version must be a positive integer');
  return parsed.data;
}

function boolean(value: unknown): boolean {
  const parsed = compiledBooleanSchema.safeParse(value);
  if (!parsed.success) throw new Error('Expected boolean');
  return parsed.data;
}

function commentPublicationState(value: unknown): CommentPublicationState {
  if (
    value !== 'unpublished' &&
    value !== 'publishing' &&
    value !== 'reconciling' &&
    value !== 'published' &&
    value !== 'excluded' &&
    value !== 'failed'
  )
    throw new Error('Invalid comment publication state');
  return value;
}
function reviewPublicationState(value: unknown): ReviewPublicationState {
  if (
    value !== 'unpublished' &&
    value !== 'publishing' &&
    value !== 'published' &&
    value !== 'partial' &&
    value !== 'failed'
  )
    throw new Error('Invalid review publication state');
  return value;
}

export function parsePublishReview(value: unknown): PublishReview {
  const parsed = compiledPublishReviewSchema.safeParse(value);
  if (!parsed.success)
    throw new Error('Publish accepts only the saved revision and curation version');
  return {
    revision: nonblank(parsed.data.revision, 'Revision'),
    curationVersion: reviewVersion(parsed.data.curationVersion),
  };
}

export function parseReviewPublicationReceipt(value: unknown): ReviewPublicationReceipt {
  const parsed = compiledPublicationReceiptSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`Publication receipt is invalid: ${z.prettifyError(parsed.error)}`);
  const row = parsed.data;
  const state = row.state;
  if (state !== 'published' && state !== 'partial' && state !== 'failed')
    throw new Error('Invalid publication outcome');
  const comments = row.comments.map((comment) => ({
    id: identifier(comment.id),
    state: commentPublicationState(comment.state),
    retryable: boolean(comment.retryable),
    discussionId: maybeString(comment.discussionId, 'Discussion ID'),
    error: maybeString(comment.error, 'Publication error'),
  }));
  if (new Set(comments.map((comment) => comment.id)).size !== comments.length)
    throw new Error('Duplicate publication receipts');
  if (
    !comments.length ||
    (state === 'published' && comments.some((comment) => comment.state !== 'published'))
  )
    throw new Error('Publication outcome does not match comment receipts');
  return {
    reviewId: identifier(row.reviewId),
    ...parsePublishReview({ revision: row.revision, curationVersion: row.curationVersion }),
    state,
    comments,
  };
}

function inclusion(value: unknown): 'included' | 'dismissed' {
  if (value !== 'included' && value !== 'dismissed') throw new Error('Invalid inclusion choice');
  return value;
}

function identifier(value: unknown): string {
  const id = nonblank(value, 'ID');
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid ID');
  return id;
}

export function parseReviewComments(value: unknown): ReviewComments {
  const parsed = compiledReviewCommentsSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`Review comments are invalid: ${z.prettifyError(parsed.error)}`);
  const row = parsed.data;
  const review = row.review;
  const mr = review.mr;
  const curation = review.curation;
  const publication = review.publication;
  const result: ReviewComments = {
    review: {
      id: identifier(review.id),
      revision: nonblank(review.revision, 'Revision'),
      state: nonblank(review.state, 'State'),
      stage: nonblank(review.stage, 'Stage'),
      current: boolean(review.current),
      decision: nonblank(review.decision, 'Decision'),
      repo: maybeString(review.repo, 'Repository'),
      mr: {
        projectId: line(mr.projectId),
        iid: line(mr.iid),
        url: nonblank(mr.url, 'MR URL'),
        headSha: nonblank(mr.headSha, 'Head SHA'),
        baseSha: nonblank(mr.baseSha, 'Base SHA'),
        startSha: nonblank(mr.startSha, 'Start SHA'),
        sourceBranch: maybeString(mr.sourceBranch, 'Source branch'),
        targetBranch: maybeString(mr.targetBranch, 'Target branch'),
      },
      curation: {
        version: reviewVersion(curation.version),
        mutable: boolean(curation.mutable),
      },
      publication: {
        state: reviewPublicationState(publication.state),
        published: reviewVersion(publication.published),
        failed: reviewVersion(publication.failed),
      },
    },
    comments: row.comments.map((comment) => {
      const candidate = comment.candidate;
      const source = candidate.source;
      const original = candidate.original;
      const commentPublication = comment.publication;
      const kind = source.kind;
      return {
        id: identifier(comment.id),
        title: nonblank(comment.title, 'Title'),
        severity: maybeString(comment.severity, 'Severity'),
        category: nonblank(comment.category, 'Category'),
        inclusion: inclusion(comment.inclusion),
        candidate: {
          text: nonblank(candidate.text, 'Candidate text'),
          version: candidateVersion(candidate.version),
          source:
            kind === 'reviewer'
              ? {
                  kind,
                  reviewer: nonblank(source.reviewer, 'Reviewer'),
                  runId: maybeString(source.runId, 'Run ID'),
                }
              : {
                  kind,
                  by: nonblank(source.by, 'Source by'),
                  at: nonblank(source.at, 'Source at'),
                },
          original: {
            text: nonblank(original.text, 'Original text'),
            reviewer: nonblank(original.reviewer, 'Reviewer'),
            runId: maybeString(original.runId, 'Original run'),
          },
        },
        position: parseReviewCommentPosition(comment.position),
        publication: {
          state: commentPublicationState(commentPublication.state),
          discussionId: maybeString(commentPublication.discussionId, 'Discussion ID'),
          retryable: boolean(commentPublication.retryable),
          error: maybeString(commentPublication.error, 'Publication error'),
        },
      };
    }),
  };
  if (new Set(result.comments.map((comment) => comment.id)).size !== result.comments.length)
    throw new Error('Duplicate review comment IDs');
  return result;
}

export function parseCurateReview(value: unknown): CurateReview {
  const parsed = compiledCurationReviewSchema.safeParse(value);
  if (!parsed.success) throw new Error('Unknown curation field');
  const changes = parsed.data.changes.map((change) => ({
    id: identifier(change.id),
    inclusion: change.inclusion,
    ...(change.candidate === undefined
      ? {}
      : {
          candidate: {
            expectedVersion: change.candidate.expectedVersion,
            text: nonblank(change.candidate.text, 'Candidate text'),
          },
        }),
  }));
  if (!changes.length || new Set(changes.map((change) => change.id)).size !== changes.length)
    throw new Error('Curation changes must have unique IDs');
  return {
    revision: nonblank(parsed.data.revision, 'Revision'),
    expectedVersion: reviewVersion(parsed.data.expectedVersion),
    by: nonblank(parsed.data.by, 'By'),
    changes,
  };
}

function side(value: unknown): ReviewCommentSide {
  if (value !== 'old' && value !== 'new') throw new Error('Position side must be old or new');
  return value;
}

function line(value: unknown): number {
  const parsed = compiledPositiveLineSchema.safeParse(value);
  if (!parsed.success) throw new Error('Position line must be a positive safe integer');
  return parsed.data;
}

/** Matches upstream normalize-position; never extracts a location from prose. */
export function parseReviewCommentPosition(value: unknown): ReviewCommentPosition {
  const parsed = compiledCommentPositionSchema.safeParse(value);
  if (!parsed.success) throw new Error('Comment position has unknown fields');
  const row = parsed.data;
  if (row.kind === 'general' || row.kind === 'unsupported')
    return { kind: row.kind, reason: nonblank(row.reason, 'Position reason') };
  const endSide = side(row.side);
  const endLine = line(row.line);
  const startSide = row.startSide ?? null;
  const startLine = row.startLine ?? null;
  if ((startSide === null) !== (startLine === null))
    throw new Error('Line range requires both startSide and startLine');
  const start = startSide === null ? null : { side: side(startSide), line: line(startLine) };
  if (start !== null && (start.side !== endSide || start.line > endLine))
    throw new Error('Line range must start on the same side at or before line');
  return {
    kind: row.kind,
    oldPath: nonblank(row.oldPath, 'Old path'),
    newPath: nonblank(row.newPath, 'New path'),
    side: endSide,
    line: endLine,
    start,
  };
}
