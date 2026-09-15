import type { ReviewCommentPosition } from '../../shared/review-comments';

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
