export type ReviewCommentSide = 'old' | 'new';
export type ReviewPublicationState =
  'unpublished' | 'publishing' | 'published' | 'partial' | 'failed';
export type CommentPublicationState =
  'unpublished' | 'publishing' | 'reconciling' | 'published' | 'excluded' | 'failed';
export type ReviewCommentPosition =
  | {
      kind: 'line';
      oldPath: string;
      newPath: string;
      side: ReviewCommentSide;
      line: number;
      start: { side: ReviewCommentSide; line: number } | null;
    }
  | { kind: 'general'; reason: string }
  | { kind: 'unsupported'; reason: string };

export interface ReviewComment {
  id: string;
  title: string;
  severity: string | null;
  category: string;
  inclusion: 'included' | 'dismissed';
  candidate: {
    text: string;
    version: number;
    source:
      | { kind: 'reviewer'; reviewer: string; runId: string | null }
      | { kind: 'user-adopted'; by: string; at: string };
    original: { text: string; reviewer: string; runId: string | null };
  };
  position: ReviewCommentPosition;
  publication: {
    state: CommentPublicationState;
    discussionId: string | null;
    retryable: boolean;
    error: string | null;
  };
}

export interface ReviewComments {
  review: {
    id: string;
    revision: string;
    state: string;
    stage: string;
    current: boolean;
    decision: string;
    repo: string | null;
    mr: {
      projectId: number;
      iid: number;
      url: string;
      headSha: string;
      baseSha: string;
      startSha: string;
      sourceBranch: string | null;
      targetBranch: string | null;
    };
    curation: { version: number; mutable: boolean };
    publication: { state: ReviewPublicationState; published: number; failed: number };
  };
  comments: ReviewComment[];
}

export interface CurateReview {
  revision: string;
  expectedVersion: number;
  by: string;
  changes: {
    id: string;
    inclusion: 'included' | 'dismissed';
    candidate?: { expectedVersion: number; text: string };
  }[];
}

export interface PublishReview {
  revision: string;
  curationVersion: number;
}
export interface ReviewPublicationReceipt {
  reviewId: string;
  revision: string;
  curationVersion: number;
  state: 'published' | 'partial' | 'failed';
  comments: {
    id: string;
    state: CommentPublicationState;
    retryable: boolean;
    discussionId: string | null;
    error: string | null;
  }[];
}

/** Local preconditions only; upstream revalidates remote revision and diff positions. */
export function reviewPublicationBlock(snapshot: ReviewComments): string | null {
  const review = snapshot.review;
  if (
    !review.current ||
    review.state !== 'active' ||
    review.stage !== 'reviewed' ||
    review.decision !== 'pending'
  )
    return 'Only the current, active review awaiting a decision can be sent.';
  if (review.publication.state === 'published') return 'This review has already been published.';
  const included = snapshot.comments.filter((comment) => comment.inclusion === 'included');
  if (!included.length) return 'Include at least one comment before sending.';
  if (included.some((comment) => comment.position.kind === 'unsupported'))
    return 'Dismiss included comments with unsupported positions before sending.';
  if (included.some((comment) => !comment.candidate.text.trim()))
    return 'Included comments must contain text.';
  return null;
}
