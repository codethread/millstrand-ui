# Completed work: three prototypes

Open **Completed** in the workspace sidebar. The three tabs use the same real
workspace board snapshot; none adds requests, endpoints or poll owners.

1. **Timeline** — newest-first cards grouped by day, with a link into that day’s recap.
2. **Day recap** — defaults to yesterday, with previous/next day, a date picker,
   Today/Yesterday shortcuts, and separate feature, epic and recorded-owner totals.
3. **Ledger** — dense, newest-first rows for comparing dates, work, owners and labels.
   The table scrolls horizontally on narrow screens without widening the page.

All three support search by title, ID, owner, branch and labels, and open the existing
issue detail panel. Search, prototype, selected date and selected card are shareable
URL state and restore with Back/reload. Search is separate from board filters;
selecting another workspace starts clean. Board’s **Include completed** remains
unchanged. Saved views and sidebar label filters return to the board.

## Important data limitation

The persisted card model has `created_at` and `updated_at`, but no immutable
completion timestamp or transition event history. **These prototypes use last update
as an explicitly labelled completion estimate.** An edit after completion can move a
card to another day. Do not use these dates as an exact delivery audit. A production
completion-history design needs an upstream recorded closure timestamp/history.

Only cards with state `closed` and outcome `done` appear. Abandoned, unactioned and
unknown outcomes are excluded. Features and epics both appear, with separate recap
counts; tasks are not counted. Cards without usable timestamps are kept at the end
under Date unavailable, not assigned a fabricated date. SQLite’s timezone-less UTC
timestamps are converted to browser-local dates, including calendar-day navigation
across DST. Each prototype displays the limitation before its results.

## Implementation

- `src/components/completed-view.tsx`: prototype controls and the three renderers.
- `src/lib/board.ts`: done-card selection, ordering, day grouping and recap projection.
- `src/hooks/use-cards.ts`: `useCompletedHistory`, a disabled reader of `board.cards`,
  memoized on the cards and search. Health remains a separate `useBoardStatus` reader.
- `src/lib/dashboard-search.ts` / `navigation.ts`: `mode=completed`,
  `historyLayout=timeline|recap|ledger`, `historyDay=YYYY-MM-DD`, and `historyQuery`.
- `WorkspaceResourcePolls` remains the owner of board freshness in this mode.
  Startup loading/disconnected handling and issue panels remain in the existing shell;
  failed refreshes retain and explicitly label last-known work.

## Verification

`pnpm quality` passes (329 tests). Focused board/navigation checks also pass with
`TZ=America/New_York` and board checks with `TZ=Asia/Tokyo`. Tests cover done-only
membership, reopened/abandoned/unknown exclusions, deterministic chronological
ordering, unknown dates, parent context, search, recap counts, UTC interpretation,
local grouping, calendar boundaries, and URL restoration/validation.

Browser-checked against the real millstrand-ui workspace: all three prototypes,
search and empty results, selected-card details/label controls, yesterday and date
navigation, empty day, timeline-to-recap links, Back/reload, sidebar return to Board,
existing Include completed, and narrow 390px layout. Screenshots:

- [Timeline](evidence/f3tnr/timeline.png)
- [Day recap](evidence/f3tnr/recap.png)
- [Ledger](evidence/f3tnr/ledger.png)
- [Narrow recap](evidence/f3tnr/mobile-recap.png)
- [Narrow ledger](evidence/f3tnr/mobile-ledger.png)
