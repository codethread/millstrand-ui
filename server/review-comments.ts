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

export function candidateVersion(value: unknown): number {
  const version = reviewVersion(value);
  if (version < 1) throw new Error('Candidate version must be a positive integer');
  return version;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Expected boolean');
  return value;
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
  const row = object(value, 'Publish request');
  if (Object.keys(row).some((key) => !['revision', 'curationVersion'].includes(key)))
    throw new Error('Publish accepts only the saved revision and curation version');
  return {
    revision: nonblank(row['revision'], 'Revision'),
    curationVersion: reviewVersion(row['curationVersion']),
  };
}

export function parseReviewPublicationReceipt(value: unknown): ReviewPublicationReceipt {
  const row = object(value, 'Publication receipt');
  const state = row['state'];
  if (state !== 'published' && state !== 'partial' && state !== 'failed')
    throw new Error('Invalid publication outcome');
  const comments = array(row['comments'], 'Publication comments').map((item) => {
    const comment = object(item, 'Comment receipt');
    return {
      id: identifier(comment['id']),
      state: commentPublicationState(comment['state']),
      retryable: boolean(comment['retryable']),
      discussionId: maybeString(comment['discussionId'], 'Discussion ID'),
      error: maybeString(comment['error'], 'Publication error'),
    };
  });
  if (new Set(comments.map((comment) => comment.id)).size !== comments.length)
    throw new Error('Duplicate publication receipts');
  if (
    !comments.length ||
    (state === 'published' && comments.some((comment) => comment.state !== 'published'))
  )
    throw new Error('Publication outcome does not match comment receipts');
  return {
    reviewId: identifier(row['reviewId']),
    ...parsePublishReview({ revision: row['revision'], curationVersion: row['curationVersion'] }),
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
  const row = object(value, 'Review comments');
  const review = object(row['review'], 'Review');
  const mr = object(review['mr'], 'MR');
  const curation = object(review['curation'], 'Curation');
  const publication = object(review['publication'], 'Review publication');
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
        sourceBranch: maybeString(mr['sourceBranch'], 'Source branch'),
        targetBranch: maybeString(mr['targetBranch'], 'Target branch'),
      },
      curation: {
        version: reviewVersion(curation['version']),
        mutable: boolean(curation['mutable']),
      },
      publication: {
        state: reviewPublicationState(publication['state']),
        published: reviewVersion(publication['published']),
        failed: reviewVersion(publication['failed']),
      },
    },
    comments: array(row['comments'], 'Comments').map((item) => {
      const comment = object(item, 'Comment');
      const candidate = object(comment['candidate'], 'Candidate');
      const source = object(candidate['source'], 'Source');
      const original = object(candidate['original'], 'Original');
      const commentPublication = object(comment['publication'], 'Publication');
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
          version: candidateVersion(candidate['version']),
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
          state: commentPublicationState(commentPublication['state']),
          discussionId: maybeString(commentPublication['discussionId'], 'Discussion ID'),
          retryable: boolean(commentPublication['retryable']),
          error: maybeString(commentPublication['error'], 'Publication error'),
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
  const changes = array(row['changes'], 'Changes').map((item) => {
    const change = object(item, 'Change');
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
              expectedVersion: candidateVersion(candidate['expectedVersion']),
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
