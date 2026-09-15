export type ReviewCommentSide = 'old' | 'new';
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
    state: string;
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
      sourceBranch: string;
      targetBranch: string;
    };
    curation: { version: number; mutable: boolean };
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
