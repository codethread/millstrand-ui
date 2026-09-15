import type {
  CurateReview,
  ReviewComments,
  ReviewCommentPosition,
  ReviewCommentSide,
} from '../shared/review-comments.ts';
import { array, maybeString, object, string } from './parse.ts';

function nonblank(value: unknown, field: string): string {
  const text = string(value, field);
  if (!text.trim()) throw new Error(`${field} must not be blank`);
  return text;
}

export function reviewVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Review version must be a nonnegative safe integer');
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Expected boolean');
  return value;
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
  const row = object(value, 'Review comments');
  const review = object(row['review'], 'Review');
  const mr = object(review['mr'], 'MR');
  const curation = object(review['curation'], 'Curation');
  const result: ReviewComments = {
    review: {
      id: identifier(review['id']),
      revision: nonblank(review['revision'], 'Revision'),
      state: nonblank(review['state'], 'State'),
      stage: nonblank(review['stage'], 'Stage'),
      current: boolean(review['current']),
      decision: nonblank(review['decision'], 'Decision'),
      repo: maybeString(review['repo'], 'Repository'),
      mr: {
        projectId: line(mr['projectId']),
        iid: line(mr['iid']),
        url: nonblank(mr['url'], 'MR URL'),
        headSha: nonblank(mr['headSha'], 'Head SHA'),
        baseSha: nonblank(mr['baseSha'], 'Base SHA'),
        startSha: nonblank(mr['startSha'], 'Start SHA'),
        sourceBranch: nonblank(mr['sourceBranch'], 'Source branch'),
        targetBranch: nonblank(mr['targetBranch'], 'Target branch'),
      },
      curation: {
        version: reviewVersion(curation['version']),
        mutable: boolean(curation['mutable']),
      },
    },
    comments: array(row['comments'], 'Comments').map((value) => {
      const comment = object(value, 'Comment');
      const candidate = object(comment['candidate'], 'Candidate');
      const source = object(candidate['source'], 'Source');
      const original = object(candidate['original'], 'Original');
      const publication = object(comment['publication'], 'Publication');
      const kind = source['kind'];
      if (kind !== 'reviewer' && kind !== 'user-adopted')
        throw new Error('Invalid candidate source');
      return {
        id: identifier(comment['id']),
        title: nonblank(comment['title'], 'Title'),
        severity: maybeString(comment['severity'], 'Severity'),
        category: nonblank(comment['category'], 'Category'),
        inclusion: inclusion(comment['inclusion']),
        candidate: {
          text: nonblank(candidate['text'], 'Candidate text'),
          version: reviewVersion(candidate['version']),
          source:
            kind === 'reviewer'
              ? {
                  kind,
                  reviewer: nonblank(source['reviewer'], 'Reviewer'),
                  runId: maybeString(source['runId'], 'Run ID'),
                }
              : {
                  kind,
                  by: nonblank(source['by'], 'Source by'),
                  at: nonblank(source['at'], 'Source at'),
                },
          original: {
            text: nonblank(original['text'], 'Original text'),
            reviewer: nonblank(original['reviewer'], 'Reviewer'),
            runId: maybeString(original['runId'], 'Original run'),
          },
        },
        position: parseReviewCommentPosition(comment['position']),
        publication: {
          state: nonblank(publication['state'], 'Publication state'),
          discussionId: maybeString(publication['discussionId'], 'Discussion ID'),
          retryable: boolean(publication['retryable']),
          error: maybeString(publication['error'], 'Publication error'),
        },
      };
    }),
  };
  if (new Set(result.comments.map((comment) => comment.id)).size !== result.comments.length)
    throw new Error('Duplicate review comment IDs');
  return result;
}

export function parseCurateReview(value: unknown): CurateReview {
  const row = object(value, 'Curation request');
  if (
    Object.keys(row).some((key) => !['revision', 'expectedVersion', 'by', 'changes'].includes(key))
  )
    throw new Error('Unknown curation field');
  const changes = array(row['changes'], 'Changes').map((value) => {
    const change = object(value, 'Change');
    if (Object.keys(change).some((key) => !['id', 'inclusion', 'candidate'].includes(key)))
      throw new Error('Unknown comment change');
    const candidate =
      change['candidate'] === undefined ? null : object(change['candidate'], 'Candidate');
    if (
      candidate &&
      Object.keys(candidate).some((key) => !['expectedVersion', 'text'].includes(key))
    )
      throw new Error('Unknown candidate change');
    return {
      id: identifier(change['id']),
      inclusion: inclusion(change['inclusion']),
      ...(candidate === null
        ? {}
        : {
            candidate: {
              expectedVersion: reviewVersion(candidate['expectedVersion']),
              text: nonblank(candidate['text'], 'Candidate text'),
            },
          }),
    };
  });
  if (!changes.length || new Set(changes.map((change) => change.id)).size !== changes.length)
    throw new Error('Curation changes must have unique IDs');
  return {
    revision: nonblank(row['revision'], 'Revision'),
    expectedVersion: reviewVersion(row['expectedVersion']),
    by: nonblank(row['by'], 'By'),
    changes,
  };
}

function side(value: unknown): ReviewCommentSide {
  if (value !== 'old' && value !== 'new') throw new Error('Position side must be old or new');
  return value;
}

function line(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Position line must be a positive safe integer');
  return value;
}

/** Matches upstream normalize-position; never extracts a location from prose. */
export function parseReviewCommentPosition(value: unknown): ReviewCommentPosition {
  const row = object(value, 'Comment position');
  const kind = row['kind'];
  const allowed =
    kind === 'line'
      ? ['kind', 'oldPath', 'newPath', 'side', 'line', 'startSide', 'startLine']
      : ['kind', 'reason'];
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new Error('Comment position has unknown fields');
  if (kind === 'general' || kind === 'unsupported')
    return { kind, reason: nonblank(row['reason'], 'Position reason') };
  if (kind !== 'line')
    throw new Error('Comment position kind must be line, general, or unsupported');
  const endSide = side(row['side']);
  const endLine = line(row['line']);
  const startSide = row['startSide'] ?? null;
  const startLine = row['startLine'] ?? null;
  if ((startSide === null) !== (startLine === null))
    throw new Error('Line range requires both startSide and startLine');
  const start = startSide === null ? null : { side: side(startSide), line: line(startLine) };
  if (start !== null && (start.side !== endSide || start.line > endLine))
    throw new Error('Line range must start on the same side at or before line');
  return {
    kind,
    oldPath: nonblank(row['oldPath'], 'Old path'),
    newPath: nonblank(row['newPath'], 'New path'),
    side: endSide,
    line: endLine,
    start,
  };
}
