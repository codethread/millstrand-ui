# Cross-page architecture and smoke evidence

Date: 2026-09-18

Session: `5rup8-smoke-48bf789f0394`

Build served from this worktree at `http://127.0.0.1:4288`.

## Architecture audit

- Concrete client API modules remain under `src/lib/api/`; no catch-all `src/lib/api.ts` import or compatibility facade remains.
- `WorkspaceDiscovery` is the only discovery poll owner. `WorkspaceResourcePolls` is the only selected-workspace board/agent/review/view owner. Focused graph, selected review detail, comments/replies and expanded task notes retain their documented resource-lifetime polls; overview owns board/agent polls only while the workspace shell is unmounted.
- No `useDashboardStore()`, `useAgentPromptStore()` or `useReviewCommentStore()` whole-store subscription remains. Query snapshots are not copied into Zustand. Delete confirmation was the one bounded inconsistency: the overlay retained a complete `Card`; it now stores only `{ id, title }`.
- Router content uses focused selectors and commands use functional current-search updates. Mutation options retain workspace-scoped cache effects while hooks retain Router reactions.
- A relative-import graph check found no cycles across 88 non-test `src` modules. Shared leaves do not import page entries.
- The cold-start path in `docs/architecture.md` was followed successfully from card API options through hook, pure projection, page/view and focused tests; the keyed review-draft path resolves from the same guide without conversation context.
- No new repository Skill was justified: architecture rules belong in `AGENTS.md` and the module map. The existing `agent-browser` skill has supported frontmatter, routes to the installed CLI guide, and was validated by this named-session smoke pass.

## Quality

`pnpm quality` passed: Prettier, zero-warning type-aware Oxlint, strict TypeScript, 43 Vitest files / 298 tests, and production build. Vite emitted only its existing large-chunk advisory.

## Browser matrix

| Surface          | Desktop 1440×1000 | Narrow 390×844               | Behavior exercised                                                                                             |
| ---------------- | ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| All weavers      | Pass              | Pass                         | Real discovery, active cards/agent, refresh control, millstrand-ui workspace destination; no narrow overflow.  |
| Board            | Pass              | Pass                         | Real cards, search filter and clear, card selection, reload and Back.                                          |
| Outline          | Pass              | Pass via shared narrow shell | Hierarchy and standalone groups, card/action entries.                                                          |
| Graph            | Pass              | Pass                         | Unfocused graph, focus `5rup8`, graph replacement, controls and URL-owned focus; no narrow overflow.           |
| Issue details    | Pass              | Pass                         | `5rup8` detail, tabs/tasks/dependencies/properties, reload and Back; narrow sheet width stayed 390px.          |
| Agents           | Pass              | Pass                         | Active directory, exact identity selection, reload and Back.                                                   |
| Reviews/comments | Pass              | Pass                         | Controlled normalized directory/detail/comments fixture; inbox/report/comment composition and narrow layout.   |
| Overlays         | Pass              | Pass                         | Delete confirmation opened and cancelled without a request; shortcut editor opened and closed at narrow width. |

Workspace switching was exercised from millstrand-ui to harnesses.spool and URL state followed the selected workspace. Every measured narrow page had `document.documentElement.scrollWidth === innerWidth === 390`.

### Drafts, refresh errors and mutation feedback

A browser-routed review fixture was used because the live workspaces expose no suitable disposable review. The comment draft was edited, left open through a 6.5-second ordinary comments poll, and retained its exact text while publication remained locked. Cancel restored the canonical candidate. No adoption or publication request was sent.

After a successful comments snapshot, only the comments endpoint was aborted. The canonical comment remained visible while the read failure and publication refresh lock were shown. Clicking **Dismiss** against the same aborted route exercised failed curation feedback next to the comment without changing upstream state. Routes were restored and a clean final pass reported no page errors, console errors, or failed requests.

No real card move/delete/label change, agent launch, review curation or review publication occurred.

## Screenshots

- `overview-desktop.png`, `overview-narrow.png`
- `board-narrow.png`, `issue-narrow.png`
- `graph-focused-desktop.png`, `graph-narrow.png`
- `agents-narrow.png`
- `review-draft-retained.png`, `review-refresh-mutation-error.png`, `reviews-narrow.png`
- `delete-confirmation.png`, `shortcuts-narrow.png`

## Epic implementation status

The eight predecessor implementations are closed: `sfy8h`, `216lz`, `vl3cr`, `x0mgs`, `5jsdj`, `0lt9g`, graph replacement `45mjy` (for replaced `0cpeh`), and overview replacement `25k06` (for replaced `rwq4x`). `5rup8` is the ninth implementation and is ready for its delivery workflow; epic closure must follow its successful landing rather than this evidence alone.
