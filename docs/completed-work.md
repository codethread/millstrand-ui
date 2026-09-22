# Completed work

Open **Completed** in the workspace sidebar. Both layouts use the available screen
width and the same real board snapshot, without extra endpoints or poll owners.

- **Timeline** — newest-first cards grouped by day, linking into each day’s recap.
- **Day recap** — defaults to yesterday, with previous/next day, a date picker,
  Today/Yesterday shortcuts, and separate feature, epic and recorded-owner totals.
  Cards use up to three columns on wide screens and a single column on phones.

The title stays in the app header; compact layout/search/filter controls lead
straight into the results. There is no introductory hero or large summary banner.
Day totals sit beside date navigation. This follows the information-first, warm
rather than utilitarian design language recorded in `AGENTS.md`.

Search sits above the results with an accessible label. It matches title, ID, owner,
branch and labels. **Filters** narrows by epic/feature type, priority and labels;
label rules can match all or any selected labels. Selected filters appear as
removable chips. Clear search and Clear filters work independently. The sidebar’s
label shortcuts also filter Completed without leaving it. Status is fixed to done
cards rather than exposing incompatible active-work lanes.

Search and filters apply to both layouts, including day totals. The result count
above the layouts covers matching cards across all days; the recap covers only its
selected day. Search, layout, filters, date and selected card live in the URL and
restore with Back/reload. A selected card opens the existing issue details. Board’s
**Include completed** remains unchanged; selecting a saved view returns to Board.

## Date limitation

The persisted card model has `created_at` and `updated_at`, but no immutable
completion timestamp or transition event history. **Dates use last update as an
explicitly labelled completion estimate.** A later edit can move a card to another
day. Do not use these dates as an exact delivery audit; that requires upstream
closure timestamps/history. The compact **Dates estimated** control keeps this
uncertainty visible and opens the explanation by click, touch or keyboard. Refresh
failures remain visible beside it, not hidden in the explanation.

Only cards with state `closed` and outcome `done` appear. Abandoned, unactioned and
unknown outcomes are excluded. Features and epics have separate recap counts;
tasks are not counted. Unknown dates appear at the end of Timeline rather than
being assigned a fabricated date. SQLite’s UTC timestamps are converted to local
dates, with calendar-day navigation across DST.

## Implementation

- `src/components/completed-view.tsx`: layout, search, active chips and renderers.
- `src/components/dashboard-filters.tsx`: shared type/priority controls; Completed
  hides status and adds label matching controls.
- `src/lib/board.ts`: `completedHistory` applies `ViewFilter` with done-only
  membership, then orders by last update; `completedDays` / `completedRecap` group it.
- `src/hooks/use-cards.ts`: disabled `board.cards` and `board.labels` readers.
  `useCompletedHistory` memoizes cards, search and filters; health stays separate.
- `src/lib/dashboard-search.ts` / `navigation.ts`: `mode=completed`,
  `historyLayout=timeline|recap`, `historyDay=YYYY-MM-DD`, `historyQuery`, and `filter`.
  Completed search overrides board search; active-only lane restrictions do not
  affect history. Type/priority/label actions preserve the Completed route.
- `WorkspaceResourcePolls` still owns freshness; the existing shell handles startup
  loading/disconnection and issue panels. Refresh failures retain last-known work.

## Verification

`pnpm quality`: formatting, strict types, zero-warning lint, 331 tests and build.
Focused tests cover intersecting search/type/priority/label rules, all/any/exclusions,
fixed done-only scope despite active-only filters, recap/timeline membership, URL
round trips, keeping filter edits on Completed, and rejecting the removed layout.
Existing coverage retains chronological ordering, unknown dates and timezone rules.

Browser-checked with real workspace data at 1440px and 390px in dark and light
modes: compact layouts, search, filters, date controls, date-explanation popover,
keyboard access, selection, and refresh-failure retention. At 1440px, Timeline’s
first card begins about 133px from the top and Day recap’s about 175px; the mobile
recap starts showing cards at about 271px without horizontal page overflow.
