# Review browsing architecture

This page documents the read-oriented Reviews surface and its boundary with review
curation. Comment drafts, curation mutations, and publication remain owned by the
modules listed under **Curation integration**.

## Data and URL ownership

- `WorkspaceResourcePolls` owns the selected-workspace `['reviews', workspace]`
  directory poll. `useReviewDirectory` is a disabled content reader that removes
  `fetchedAt` while preserving the `available` versus `unsupported` union.
  `useReviewsStatus` separately exposes refresh health and the last successful
  timestamp.
- Selecting a report mounts `useReviewDetailPoll(id)` for
  `['review', workspace, id]`. `useReviewDetail(id)` reads retained report content;
  `useReviewDetailStatus(id)` reads only health plus a snapshot-present marker.
  A failed refresh therefore keeps the last successful report visible and labelled.
- Review selection, inbox/all scope, stage, and search stay in Router through the
  focused hooks in `src/lib/navigation.ts`. Search typing replaces the current
  history entry; scope, stage, selection, report history, and related-strand
  navigation are discrete navigation actions.
- `reviewDirectoryContent`, `reviewInboxModel`, and `reviewDetailModel` in
  `src/lib/reviews.ts` are pure projections. Inbox means active plus locally pending,
  including outdated revisions. Unsupported review directories never become a
  successful empty inbox. Reviewer run ownership comes from the shared
  `useAgentRunIdentities` projection in `src/hooks/use-agents.ts`.

## Component boundaries

- `ReviewsView` is the workspace page controller. It composes Router values, the
  directory/detail readers, retained-error feedback, and navigation callbacks.
- `ReviewInbox` renders the concrete `ReviewInboxModel`; `ReviewSearchControls`
  owns only the header's focused Router controls.
- `ReviewReport` renders report metadata and Markdown, reviewer evidence, history,
  activity, and related-strand links. It has no Query, Router, Zustand, or
  curation imports. Reviewer run links receive only the shared run-to-identity
  projection, not the full agent directory or its refresh timestamp. A run remains
  inspectable by exact ID while identity publication is absent or delayed.
- `ReviewStatus` is the shared browsing leaf for list and history status labels.

## Curation integration

`ReviewReportProps` and `ReviewReportIntegrations` in
`src/components/review-report.tsx` are the downstream seam. The browsing controller
supplies:

- `model`, the pure `ReviewDetailModel` containing the authoritative report detail,
  heading, current/outdated state, and report state;
- `integrations.comments`, currently `ReviewComments` keyed by
  `model.review.id`;
- explicit callbacks for reviewer runs, report history, and related strands.

The curation feature may replace or refine the comments slot composition without
moving report layout, URL selection, or detail polling into comment modules. It
continues to own `src/components/review-comments.tsx`,
`src/components/review-publication.tsx`, `src/hooks/use-review-comments.ts`,
`src/review-comment-store.ts`, and the corresponding pure comment/publication
modules. Browsing must not infer comments from report Markdown or alter draft,
curation, receipt, or publication semantics.

## Curation and publication ownership

- `useReviewCommentsRead` exposes explicit loading, failed, and ready-with-optional-
  retained-error states for the canonical `review-comments` Query snapshot.
  `useReviewProposals` separately composes targeted agent replies as loading, ready,
  partial, or failed; a directory/reply failure never hides proposals that remain
  available. `reviewCommentModels` in `src/lib/review-comments.ts` filters proposals
  by review, frozen revision, and comment while retaining the revision and curation
  version required by mutations.
- Canonical candidates, inclusion, curation versions, publication receipts, and all
  mutation feedback remain in TanStack Query. A proposal is only agent output until
  a user opens it as a draft and explicitly adopts it. Curation success updates the
  canonical snapshot through invalidation; it does not make Zustand authoritative.
- `src/review-comment-store.ts` owns only browser drafts, per-key storage failures,
  and focus. Every key includes workspace, review, frozen revision, and comment.
  Comment controllers subscribe to one key; publication subscribes only to aggregate
  unsaved/error booleans for the displayed keys. Loading preserves the validated
  closed/editing discriminant and safe candidate/edit counters. Rebase is explicit,
  cancel closes the draft, and adoption closes only the exact submitted draft so a
  newer in-flight edit or replacement survives an older success.
- Publication hydrates every displayed draft key before evaluating readiness and
  remains locked by unsaved drafts, storage errors, comment refresh/read errors,
  active curation, or publishing. The first send captures the displayed revision and
  curation version; retries reuse that exact snapshot until the user explicitly
  chooses the currently displayed saved snapshot. Comment-query receipts are rendered
  as authoritative reconciliation state. A failed HTTP response is an uncertain
  external outcome, triggers receipt refresh, and never clears drafts or implies that
  nothing was published.
