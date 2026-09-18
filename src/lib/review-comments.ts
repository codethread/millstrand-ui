import type { AgentReply } from '../../shared/api';
import type {
  ReviewComment,
  ReviewCommentPosition,
  ReviewComments,
} from '../../shared/review-comments';

export interface ReviewCurationContext {
  reviewId: string;
  revision: string;
  curationVersion: number;
  mutable: boolean;
}

export interface ReviewCommentProposalModel {
  reply: AgentReply;
  candidateVersion: number;
}

export interface ReviewCommentModel {
  comment: ReviewComment;
  curation: ReviewCurationContext;
  positionLabel: string;
  positionValidation: string | null;
  proposals: ReviewCommentProposalModel[];
}

function reviewCommentProposals(
  replies: AgentReply[],
  reviewId: string,
  revision: string,
  commentId: string,
): ReviewCommentProposalModel[] {
  return replies.flatMap((reply) => {
    const prompt = reply.prompt;
    if (
      prompt?.kind !== 'review-comment' ||
      prompt.cardId !== reviewId ||
      prompt.comment.id !== commentId ||
      prompt.comment.revision !== revision
    )
      return [];
    return [{ reply, candidateVersion: prompt.comment.candidateVersion }];
  });
}

export function reviewCommentModels(
  snapshot: ReviewComments,
  replies: AgentReply[],
): ReviewCommentModel[] {
  const curation: ReviewCurationContext = {
    reviewId: snapshot.review.id,
    revision: snapshot.review.revision,
    curationVersion: snapshot.review.curation.version,
    mutable: snapshot.review.current && snapshot.review.curation.mutable,
  };
  return snapshot.comments.map((comment) => ({
    comment,
    curation,
    positionLabel: reviewCommentPositionLabel(comment.position),
    positionValidation: reviewCommentPositionValidation(comment.position),
    proposals: reviewCommentProposals(
      replies,
      snapshot.review.id,
      snapshot.review.revision,
      comment.id,
    ),
  }));
}

export function reviewCommentCandidateConflict(
  savedCandidateVersion: number | null,
  canonicalCandidateVersion: number,
): boolean {
  return savedCandidateVersion !== null && savedCandidateVersion !== canonicalCandidateVersion;
}

export function reviewCommentPositionLabel(position: ReviewCommentPosition): string {
  if (position.kind === 'general') return `General discussion · ${position.reason}`;
  if (position.kind === 'unsupported') return `Unsupported position · ${position.reason}`;
  const path = position.side === 'old' ? position.oldPath : position.newPath;
  const range =
    position.start !== null && position.start.line !== position.line
      ? `${position.start.line}–${position.line}`
      : `${position.line}`;
  return `${path} · ${position.side} ${position.start !== null && position.start.line !== position.line ? 'lines' : 'line'} ${range}`;
}

/** Structural support alone does not prove a line belongs to the frozen diff. */
export function reviewCommentPositionValidation(position: ReviewCommentPosition): string | null {
  return position.kind === 'unsupported'
    ? `Cannot publish at this position: ${position.reason}`
    : null;
}
