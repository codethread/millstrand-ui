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
  Graph keeps its `{ cards, allCards }` props unchanged; its source, layout and
  canvas lifecycle are documented in [graph ownership](graph.md). Overview can use
  the pure projections without importing issue components or starting another cache.
- `BoardView({ columns })` and `OutlineView({ groups })` render explicit models;
  individual cards receive only their card and nullable parent. Parent context can
  remain visible even when the parent does not match; unmatched children stay hidden.
  All columns appear only with matching cards; completed remains opt-in.
  `selectBoardLanes` orders review, production observation, progress, ready, refinement,
  completed, other, without changing the shared menu/filter lane order.

## Detail and edits

`IssueDetail({ id })` owns the selected detail query and URL tabs. `issue-tasks.tsx`
contains Notes, TaskRow and TaskActivity; expanded tasks alone enable task-note polling.
Full card notes are a separate `useCardNotes` query, enabled only on the Notes tab
(`/cards/:id/notes`). The detail response no longer embeds them. Hidden tabs stop
fetching and polling; the count appears after the first successful read. Initial
failures remain errors, and refresh failures keep the last notes with a warning.
TaskActivity retains successful notes on failure and labels them last-known, as
IssueDetail does for detail refresh failures. Properties and label forms are in
`issue-properties.tsx` and `issue-labels.tsx`. Label typing remains in the local form.

`useLabelEditor`, `useCardMenu` and `useDeleteCard` compose mutations and interaction
commands. Domain mutation options still own awaited invalidation; `useCardAction`
still owns workspace-guarded selected issue/graph cleanup after successful deletion.
No optimistic writes or cache mirrors were introduced. Menus prevent their closing
focus restoration from dismissing the newly opened delete dialog; Cancel receives
initial focus. Agent badge entry points are unchanged.

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

## Compact layouts (selected from study 71jt6)

Production integration is tracked by `d5uig`. Board and Outline keep their existing
URL modes and shortcuts; these are replacements, not additional presentation flags.
The design-only branch stays separate: no snapshot, lab CSS, frozen data, or prototype
inspector is bundled into the app.

- `board-view.tsx` renders compact cards and dense two-column rows using Tailwind
  container queries. All labels wrap and toggle the existing URL filter. Narrow
  lanes/rows stack; occupied lanes use available width without a horizontal scroller.
- A shared title button opens `IssueDetail`; the small epic link opens its parent.
  Epic headers retain explicit “Parent context” when they do not match filters.
- `CardContextMenu` / `CardMenuButton` remain the single action set for cards,
  feature rows and now epic headers. Redundant inline Explore graph is removed:
  both graph actions live in those same touch/keyboard-accessible menus. Dependency
  counts retain their explanatory popover and workspace-wide meaning.
- `card-signals.tsx` separates activity from auto-run configuration. Previews on
  hover/focus are noninteractive; pinned Radix popovers contain the existing
  details/agent links. Escape returns to the signal trigger. Full ownership and
  opt-out context remain in the drawer even when no compact badge is needed.
- Retired board/outline CSS and `AutoRunSummary` are removed. Shared label/status/
  muted colours retain the warm palette with readable light/dark contrast. Tailwind's
  base form-font reset now applies instead of an unlayered reset overriding compact
  button typography.

### Integration verification

Focused tests cover occupied-lane ordering/filter membership, signal precedence
(working versus terminal owners and errors), opt-out/error visibility, and rendering
real action/label controls on both layouts. Existing mutation tests remain unchanged.

Browser checks used live Millhouse data at 1440px and 390px, in light and dark:
menus (ellipsis/right-click), disabled current lane, dependency/hierarchy navigation,
selection/reload/Back, label filters and drawer label edits, pinned signal details,
Escape/focus restoration, and retained-error paths. Browser-local request aborts
exercise lane/label/delete failures without mutating real workspace cards. Labels
are not clipped, there are no nested buttons or horizontal page overflow, and axe
reports zero violations within the compact content in both themes.

The existing delete dialog still opens on Cancel, but closing it (or a failed delete)
can leave focus on the document body; this pre-existing menu/dialog behavior was not
changed by the compact integration. Tab re-enters the open dialog's focus trap.
