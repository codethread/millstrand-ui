import { array, object, string, maybeString } from './parse.ts';
import {
  reviewStages,
  type ReviewDetail,
  type ReviewSeat,
  type ReviewSummary,
} from '../shared/reviews.ts';

function boolean(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${where} must be a boolean`);
  return value;
}
function choice<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  const found = allowed.find((item) => item === value);
  if (!found) throw new Error(`${where} is unsupported`);
  return found;
}
function seat(value: unknown): ReviewSeat {
  const row = object(value, 'reviewer');
  return {
    id: string(row['id'], 'reviewer.id'),
    name: string(row['name'], 'reviewer.name'),
    runId: maybeString(row['runId'], 'reviewer.runId'),
    status: maybeString(row['status'], 'reviewer.status'),
    substatus: maybeString(row['substatus'], 'reviewer.substatus'),
  };
}
export function parseReview(value: unknown): ReviewSummary {
  const row = object(value, 'review');
  const mr = object(row['mr'], 'review.mr');
  const iid = mr['iid'];
  if (
    iid !== null &&
    iid !== undefined &&
    (typeof iid !== 'number' || !Number.isInteger(iid) || iid < 1)
  )
    throw new Error('review.mr.iid must be a positive integer or null');
  const url = maybeString(mr['url'], 'review.mr.url');
  if (url !== null && !/^https?:\/\//i.test(url))
    throw new Error('review.mr.url must be an HTTP URL');
  return {
    id: string(row['id'], 'review.id'),
    title: string(row['title'], 'review.title'),
    state: string(row['state'], 'review.state'),
    stage: choice(row['stage'], reviewStages, 'review.stage'),
    decision: choice(row['decision'], ['pending', 'done', 'dismissed'], 'review.decision'),
    current: boolean(row['current'], 'review.current'),
    createdAt: maybeString(row['createdAt'], 'review.createdAt'),
    completedAt: maybeString(row['completedAt'], 'review.completedAt'),
    repo: maybeString(row['repo'], 'review.repo'),
    mr: {
      iid: iid ?? null,
      url,
      title: maybeString(mr['title'], 'review.mr.title'),
      sha: maybeString(mr['sha'], 'review.mr.sha'),
      baseSha: maybeString(mr['baseSha'], 'review.mr.baseSha'),
      sourceBranch: maybeString(mr['sourceBranch'], 'review.mr.sourceBranch'),
      targetBranch: maybeString(mr['targetBranch'], 'review.mr.targetBranch'),
    },
    reviewers: array(row['reviewers'], 'review.reviewers').map(seat),
    reportAvailable: boolean(row['reportAvailable'], 'review.reportAvailable'),
  };
}
export function parseReviewList(value: unknown): ReviewSummary[] {
  return array(object(value, 'reviews')['reviews'], 'reviews.reviews').map(parseReview);
}
export function parseReviewDetail(value: unknown): ReviewDetail {
  const row = object(object(value, 'review detail')['review'], 'review');
  return {
    ...parseReview(row),
    report: maybeString(row['report'], 'review.report'),
    worktree: maybeString(row['worktree'], 'review.worktree'),
    reviewers: array(row['reviewers'], 'review.reviewers').map((value) => {
      const item = object(value, 'reviewer');
      return {
        ...seat(item),
        result: maybeString(item['result'], 'reviewer.result'),
        error: maybeString(item['error'], 'reviewer.error'),
      };
    }),
    notes: array(row['notes'], 'review.notes').map((value) => {
      const item = object(value, 'review note');
      return {
        id: string(item['id'], 'note.id'),
        text: string(item['text'], 'note.text'),
        at: maybeString(item['at'], 'note.at'),
        by: maybeString(item['by'], 'note.by'),
        kind: maybeString(item['kind'], 'note.kind'),
      };
    }),
    links: array(row['links'], 'review.links').map((value) => {
      const item = object(value, 'review link');
      return {
        id: string(item['id'], 'link.id'),
        title: string(item['title'], 'link.title'),
        type: string(item['type'], 'link.type'),
      };
    }),
    history: array(row['history'], 'review.history').map(parseReview),
  };
}
