export const reviewStages = ['preparing', 'dispatching', 'running', 'reviewed', 'failed'] as const;
export type ReviewStage = (typeof reviewStages)[number];
export type ReviewDecision = 'pending' | 'done' | 'dismissed';
export type ReviewScope = 'inbox' | 'all';
export interface ReviewSeat {
  id: string;
  name: string;
  runId: string | null;
  status: string | null;
  substatus: string | null;
}
export interface ReviewSummary {
  id: string;
  title: string;
  state: string;
  stage: ReviewStage;
  decision: ReviewDecision;
  current: boolean;
  createdAt: string | null;
  completedAt: string | null;
  repo: string | null;
  mr: {
    iid: number | null;
    title: string | null;
    url: string | null;
    sha: string | null;
    baseSha: string | null;
    sourceBranch: string | null;
    targetBranch: string | null;
  };
  reviewers: ReviewSeat[];
  reportAvailable: boolean;
}
export interface ReviewDetail extends ReviewSummary {
  report: string | null;
  reviewers: (ReviewSeat & { result: string | null; error: string | null })[];
  worktree: string | null;
  notes: { id: string; text: string; at: string | null; by: string | null; kind: string | null }[];
  links: { id: string; title: string; type: string }[];
  history: ReviewSummary[];
}
export type ReviewDirectory =
  | { kind: 'unsupported'; message: string }
  | {
      kind: 'available';
      workspace: { path: string; name: string };
      fetchedAt: string;
      reviews: ReviewSummary[];
    };
