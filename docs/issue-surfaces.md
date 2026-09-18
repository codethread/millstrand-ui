# Issue surface handover

## Public contracts

- `src/components/issue-surface.tsx`: prop-free `IssueSurface`, mounted by the shell.
  Workspace startup and board retained-error feedback remain shell-owned. Graph
  renders before the filtered-empty check, so focus is available with zero matches.
- `src/hooks/use-cards.ts`: `useIssueBoard(filter)` selects the structurally shared
  cards array and memoizes `issueSurfaceContent` on cards/filter only. It is a
  disabled reader of the existing workspace poll owner, not another poller.
- `src/lib/board.ts`: `issueSurfaceContent(allCards, filter): IssueBoardContent`
  returns `cards` (sorted visible membership), `allCards` (unfiltered context),
  `columns` (`BoardColumn[]`, each containing `{ card, parent }` rows), and
  `outline` (`OutlineGroup[]`). No timestamps or query result wrappers are inputs.
  Graph keeps its existing `{ cards, allCards }` props unchanged. Overview can use
  the pure projections without importing issue components or starting another cache.
- `BoardView({ columns })` and `OutlineView({ groups })` render explicit models;
  individual cards receive only their card and nullable parent. Parent context can
  remain visible even when the parent does not match; unmatched children stay hidden.
  Production/unknown columns appear only with matching cards; completed is opt-in.

## Detail and edits

`IssueDetail({ id })` owns the selected detail query and URL tabs. `issue-tasks.tsx`
contains Notes, TaskRow and TaskActivity; expanded tasks alone enable note polling.
TaskActivity retains successful notes on failure and labels them last-known, as
IssueDetail does for detail refresh failures. Properties and label forms are in
`issue-properties.tsx` and `issue-labels.tsx`. Label typing remains in the local form.

`useLabelEditor`, `useCardMenu` and `useDeleteCard` compose mutations and interaction
commands. Domain mutation options still own awaited invalidation; `useCardAction`
still owns workspace-guarded selected issue/graph cleanup after successful deletion.
No optimistic writes or cache mirrors were introduced. Menus prevent their closing
focus restoration from dismissing the newly opened delete dialog; Cancel receives
initial focus. Agent badge and prompt entry points are unchanged.

## Verification

`pnpm quality` covers board projection/filter/hierarchy/lane behavior, existing card
mutation settlement/navigation tests and task activity loading/empty/retained-error
regressions. Browser checks used real workspace reads at 1440×1000 and 390×844:
Board, Outline parent context, search/empty, graph focus with zero matches, detail
Overview/Activity/Attributes, expanded notes, parent navigation, reload and Back.
Browser-local request aborts verified retained detail/notes and label/move/delete
errors without changing real work. Delete confirmation remains open on failure;
label text remains in the editor. Menu lanes include production/completed and disable
the current lane. No real card mutations, paid launches or external reviews occurred.
Screenshots are in `docs/evidence/vl3cr/`.
