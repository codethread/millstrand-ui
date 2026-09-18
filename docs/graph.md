# Graph surface ownership

`IssueSurface` passes the stable `cards`/`allCards` projection from
`useIssueBoard`/`issueSurfaceContent` to `GraphView`. Board startup and retained
board-error feedback stay in the shell. An empty filtered board still mounts the
graph toolbar, so a focused graph is reachable.

- `src/hooks/use-graph.ts`: `useGraphSource` composes board `graphFromCards` or
  the focused `useGraph` query (`graphQueryOptions` in `src/lib/api/cards.ts`).
  The mounted graph is the focused query's 10-second poll owner. There is no new
  key, cache, timer or mirrored snapshot. `GraphSource` distinguishes loading,
  unavailable, and successful data with nullable refresh error. A failed refresh
  retains the graph and explicitly labels it last-known; initial failure is not
  rendered as successful empty data.
- `src/components/graph-view.tsx`: Router focus/filter selection, toolbar, source
  notices and memoized layout. `GraphSourceNotice` and `GraphEmpty` render explicit
  loading/error/empty/too-large states. Only the graph reference and includeClosed
  enter layout memoization, never query wrappers, fetchedAt or composer drafts.
- `src/lib/graph.ts`: pure `graphFromCards`, `layoutGraph`, `graphStatus`,
  `graphBody`, and concrete source/layout types. Query structural sharing retains
  unchanged focused graph input; the issue projection retains unchanged board
  input. Dagre stays synchronous and unchanged as the layout engine.
- `src/components/graph-canvas.tsx`: `GraphCanvas` renders React Flow and the
  local task/work inspector. Epic/feature activation delegates to Router issue
  selection. Enter/Space activation matches clicking. Markdown and prompt entry
  come from shared leaves, not other page implementations.

## Deliberate lifecycle

The canvas key is serialized **URL focus and filter values**, not graph membership
or object identity. Focus/filter navigation (including Back) resets local inspector
selection and fits the new graph. Workspace/page unmount also resets it. Unchanged
polls, refresh health, prompt drafts and ordinary data updates do not remount the
canvas or refit pan/zoom. Membership changes from a poll update the controlled
nodes/edges without forcibly recentering; Fit View remains available. A selected
inspector is shown only while its ID is present in the current layout. Empty and
too-large layouts unmount the canvas; returning to a renderable graph fits again.
The existing navigation contract still clears focus on manual filter changes.

## Semantics

Unfocused graphs include matching issues and their epic context, not unmatched
siblings. Focused graphs retain the focused root and transitive ancestors of live
nodes even if closed; other closed nodes require includeClosed. Parent arrows point
parent → child. Dependency arrows point dependent → prerequisite, while Dagre
positions prerequisites before dependents. Only edges with both actual endpoints
are laid out. An open node with a visible open prerequisite is blocked; the subtree
cannot prove readiness against external dependencies. Empty is explicit; more than
150 visible nodes (after filtering/context inclusion) produces the narrowing notice.

## Verification for 45mjy

`pnpm quality`: strict TS, zero-warning Oxlint, 294 Vitest tests and production
build pass. `src/lib/graph.test.ts` covers shared issue membership/context,
transitive closed ancestors/root, dependency direction/placement/blocking, dangling
edges and the 150-node boundary. `src/components/graph-view.test.tsx` covers source
notices and empty/too-large distinctions.

Browser checks used real local workspace reads at 1440×1000 and 390×844:

- Unfocused and focused graphs; zoom controls and drag pan; keyboard Enter task
  inspector and Space feature detail; pane/inspector close; detail Back and reload.
- Focused and unfocused ordinary polls retained the exact viewport element and
  pan/zoom transform; focused task inspection survived a poll. Prompt draft entry
  and cancellation left viewport/selection intact, with no launch submitted.
- Closed feature vl3cr remained as the sole root when closed tasks were excluded;
  includeClosed plus focus showed all five nodes. Filter change reset the canvas;
  Back restored the URL filter and excluded closed nodes. Zero search matches kept
  the focus selector usable.
- Browser-scoped graph request delay showed loading; initial abort showed error
  without empty prose. Refresh abort retained viewport, transform and inspector
  with last-known feedback. A browser-only 151-node response showed the size notice.
  All request overrides were removed; no database fixtures or real work were mutated
  for smoke testing. No paid agent launch or external review publication occurred.
- Narrow canvas/inspector controls remained usable with document width equal to the
  390px viewport. Browser reported no uncaught page errors.

Screenshots: `docs/evidence/45mjy/` (desktop, narrow, prompt, loading, unavailable,
retained error, empty, closed inclusion and too-large states).
