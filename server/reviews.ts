import { z } from 'zod';
import {
  reviewStages,
  type ReviewDetail,
  type ReviewSeat,
  type ReviewSummary,
} from '../shared/reviews.ts';

const reviewStageSchema = z.enum(reviewStages);
const reviewDecisionSchema = z.enum(['pending', 'done', 'dismissed']);
const nullableStringSchema = z.string().nullable().optional();
const reviewMrSchema = z
  .object({
    iid: z.number().int().min(1).nullable().optional(),
    url: nullableStringSchema,
    title: nullableStringSchema,
    headSha: nullableStringSchema,
    baseSha: nullableStringSchema,
    sourceBranch: nullableStringSchema,
    targetBranch: nullableStringSchema,
  })
  .loose();
const reviewSeatSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    runId: nullableStringSchema,
    status: nullableStringSchema,
    substatus: nullableStringSchema,
  })
  .loose();
const reviewSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    state: z.string(),
    stage: reviewStageSchema,
    decision: reviewDecisionSchema,
    current: z.boolean(),
    createdAt: nullableStringSchema,
    completedAt: nullableStringSchema,
    repo: nullableStringSchema,
    mr: reviewMrSchema,
    reviewers: z.array(reviewSeatSchema),
    reportAvailable: z.boolean(),
  })
  .loose();
const reviewListSchema = z.compile(z.object({ reviews: z.array(reviewSchema) }).loose(), {
  strict: true,
});
const compiledReviewSchema = z.compile(reviewSchema, { strict: true });
const reviewDetailSchema = reviewSchema.extend({
  report: nullableStringSchema,
  worktree: nullableStringSchema,
  reviewers: z.array(
    reviewSeatSchema.extend({
      result: nullableStringSchema,
      error: nullableStringSchema,
    }),
  ),
  notes: z.array(
    z
      .object({
        id: z.string(),
        text: z.string(),
        at: nullableStringSchema,
        by: nullableStringSchema,
        kind: nullableStringSchema,
      })
      .loose(),
  ),
  links: z.array(
    z
      .object({
        id: z.string(),
        title: z.string(),
        type: z.string(),
      })
      .loose(),
  ),
  history: z.array(reviewSchema),
});
const reviewDetailEnvelopeSchema = z.compile(z.object({ review: reviewDetailSchema }).loose(), {
  strict: true,
});

type ReviewRow = z.infer<typeof reviewSchema>;
type ReviewDetailRow = z.infer<typeof reviewDetailSchema>;

function invalid(where: string): never {
  throw new Error(`${where} is invalid`);
}

function normalizeReview(row: ReviewRow): ReviewSummary {
  const url = row.mr.url ?? null;
  if (url !== null && !/^https?:\/\//i.test(url))
    throw new Error('review.mr.url must be an HTTP URL');
  return {
    id: row.id,
    title: row.title,
    state: row.state,
    stage: row.stage,
    decision: row.decision,
    current: row.current,
    createdAt: row.createdAt ?? null,
    completedAt: row.completedAt ?? null,
    repo: row.repo ?? null,
    mr: {
      iid: row.mr.iid ?? null,
      url,
      title: row.mr.title ?? null,
      sha: row.mr.headSha ?? null,
      baseSha: row.mr.baseSha ?? null,
      sourceBranch: row.mr.sourceBranch ?? null,
      targetBranch: row.mr.targetBranch ?? null,
    },
    reviewers: row.reviewers.map((seat): ReviewSeat => ({
      id: seat.id,
      name: seat.name,
      runId: seat.runId ?? null,
      status: seat.status ?? null,
      substatus: seat.substatus ?? null,
    })),
    reportAvailable: row.reportAvailable,
  };
}

function parseReviewRow(value: unknown): ReviewRow {
  const parsed = compiledReviewSchema.safeParse(value);
  if (!parsed.success) invalid('review');
  return parsed.data;
}

export function parseReview(value: unknown): ReviewSummary {
  return normalizeReview(parseReviewRow(value));
}

export function parseReviewList(value: unknown): ReviewSummary[] {
  const parsed = reviewListSchema.safeParse(value);
  if (!parsed.success) invalid('reviews');
  return parsed.data.reviews.map(normalizeReview);
}

export function parseReviewDetail(value: unknown): ReviewDetail {
  const parsed = reviewDetailEnvelopeSchema.safeParse(value);
  if (!parsed.success) invalid('review detail');
  const row: ReviewDetailRow = parsed.data.review;
  return {
    ...normalizeReview(row),
    report: row.report ?? null,
    worktree: row.worktree ?? null,
    reviewers: row.reviewers.map((seat) => ({
      id: seat.id,
      name: seat.name,
      runId: seat.runId ?? null,
      status: seat.status ?? null,
      substatus: seat.substatus ?? null,
      result: seat.result ?? null,
      error: seat.error ?? null,
    })),
    notes: row.notes.map((note) => ({
      id: note.id,
      text: note.text,
      at: note.at ?? null,
      by: note.by ?? null,
      kind: note.kind ?? null,
    })),
    links: row.links.map((link) => ({ id: link.id, title: link.title, type: link.type })),
    history: row.history.map(normalizeReview),
  };
}
