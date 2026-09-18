# App architecture and data contract

This is the implemented foundation for epic 2648y, not a second state framework.
Import concrete modules below; there is no `src/lib/api.ts` facade.

## Module map

| Home                                                                                                                    | Owns / public entry points                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/api/transport.ts`                                                                                              | `request`: same-origin `/api`, workspace query parameter, HTTP errors, the documented endpoint-contract assertion at `response.json()`                                                        |
| `src/lib/api/query-client.ts`                                                                                           | `createQueryClient`: one app client, query retry 1 and stale time 3s; mounted in `src/main.tsx`                                                                                               |
| `src/lib/api/workspaces.ts`                                                                                             | `workspaceQueryOptions`, `workspaceReaderOptions`, `useWorkspaces`: global discovery and cache readers                                                                                        |
| `src/lib/api/cards.ts`                                                                                                  | `boardQueryOptions`, `cardQueryOptions`, `graphQueryOptions`, `taskNotesQueryOptions`, `labelsMutationOptions`, `cardActionMutationOptions`                                                   |
| `src/lib/api/agents.ts`                                                                                                 | `agentQueryOptions`, `agentOptionsQueryOptions`, `agentReplyQueryOptions`, `agentPromptMutationOptions`; receipts stay tied to the submitted workspace                                        |
| `src/lib/api/views.ts`                                                                                                  | `viewsQueryOptions`, `saveViewsMutationOptions`                                                                                                                                               |
| `src/lib/api/reviews.ts`                                                                                                | `reviewsQueryOptions`, `reviewQueryOptions`                                                                                                                                                   |
| `src/lib/api/review-comments.ts`                                                                                        | `reviewCommentsQueryOptions`, `curateReviewMutationOptions`, `reviewPublishMutationOptions`                                                                                                   |
| `src/hooks/use-workspace.ts`                                                                                            | Narrow Router workspace selector                                                                                                                                                              |
| `src/hooks/use-cards.ts`, `use-agents.ts`, `use-views.ts`, `use-reviews.ts`, `use-review-comments.ts`                   | React composition: workspace resolution, concrete disabled content/status projections, mutations, dependent queries and route reactions. `use*Poll` exports are reserved for the owner below. |
| `src/Dashboard.tsx`                                                                                                     | Route-level overview/workspace composition, workspace pin/reset, and startup state                                                                                                            |
| `src/components/dashboard-shell.tsx`, `dashboard-sidebar.tsx`, `dashboard-header.tsx`                                   | Stable workspace shell, status/sidebar/header consumers, selection panels, and page slot                                                                                                      |
| `src/components/issue-surface.tsx`                                                                                      | Board/outline/graph page entry; owns issue filtering and delegates to existing surface views                                                                                                  |
| `src/components/reviews-view.tsx`, `review-inbox.tsx`, `review-report.tsx`                                              | Review page composition, focused inbox rendering, and the read-only report plus prompt/comments slots; see `docs/reviews.md`                                                                  |
| `src/components/overlays.tsx`, `saved-view-dialog.tsx`, `shortcut-dialog.tsx`                                           | Narrow overlay dispatch; Query-backed saved-view workflow and focused browser-preference editor                                                                                               |
| `src/components/workspace-resource-polls.tsx`                                                                           | Single selected-workspace poll owner for board, agents, reviews, and saved views; mounted for every workspace mode                                                                            |
| `src/components/workspace-discovery.tsx`                                                                                | Single app-lifetime discovery poll owner, mounted in `src/main.tsx`                                                                                                                           |
| `src/components/workspace-switcher.tsx`                                                                                 | Working pilot: selected option and filtered options use `select`; separate discovery health reader; URL-owned switching                                                                       |
| `src/lib/workspaces.ts`                                                                                                 | Pure `selectedWorkspace` and `matchingWorkspaces` projections                                                                                                                                 |
| `src/components/markdown.tsx`                                                                                           | Shared page-independent Markdown leaf; no issue-detail dependency                                                                                                                             |
| `src/lib/board.ts`, `agents.ts`, `reviews.ts`, `review-comments.ts`, `review-publication.ts`, `overview.ts`, `graph.ts` | Pure domain projections and rules; extend these homes for later surfaces, not API modules or another selector framework                                                                       |
| `src/lib/navigation.ts`, `dashboard-search.ts`                                                                          | Router composition/actions and URL schemas/destination transforms respectively                                                                                                                |
| `src/store.ts`, `agent-prompt-store.ts`, `review-comment-store.ts`                                                      | Shared interaction state, preferences/receipts, and keyed persisted drafts; never mirrored server snapshots                                                                                   |

### Validation boundaries (unchanged)

`shared/api.ts`, `shared/reviews.ts`, and `shared/review-comments.ts` define normalized
UI contracts, **not client response schemas**. Named compiled Zod schemas remain in
`server/parse.ts`, `agents.ts`, `agent-prompts.ts`, `reviews.ts`, `review-comments.ts`,
`card-actions.ts`, and `workspaces.ts`. Server saved views pass through the schemas
in `server/parse.ts` via `server/views.ts`. Preserve normalization, additive-field
policy, and failures for malformed known fields when extending these boundaries.
URL parsing belongs to `src/lib/dashboard-search.ts`; persisted review-draft
schemas belong to `src/review-comment-store.ts`. Browser preference/receipt parsing
is in `src/lib/agent-preferences.ts`. Do not add assertions or repeated parsers in
components to compensate for a boundary change.

### Auto-run card properties

`Card.autoRun` is a nullable, normalized configuration/dispatcher snapshot parsed in
`server/parse.ts`; it is not an agent lifecycle. Opt-in comes from the spool's
`kanban.label/auto-run` string flag, and all `auto-run/*` values are read-only.
The compact board CLI omits custom attributes, so `StrandData.board` reads its
domain membership first, then hydrates persisted attributes through
`server/workspace-database.ts`. The reader discovers the workspace's file-backed
SQLite database from `mill weaver list`, opens it read-only with `query_only`, and
requires the supported persisted schema version. Its bounded SQL projection selects
up to 10,001 card rows so overflow fails instead of truncating, while retaining errors
longer than the CLI's lean-string limit. The query tolerates IDs deleted between the
membership and hydration reads. It selects only card metadata, label flags and known
auto-run fields; large bodies and unrelated attributes never enter the server result.
Deleted cards are omitted, and cards created after membership was read appear next
poll. Reads stay in short autocommit transactions so they do not pin the WAL. Failures
remain visible with normal Query refresh-error retention. No per-card requests, new
endpoints, query keys, or poll owners are added. Raw detail attributes remain available
unchanged. `AutoRunSummary` and `AutoRunDetails` render this snapshot separately from
`IssueAgents`, which remains authoritative for worker activity.

## Checked read inventory

All paths below have `/api` prepended. `w` is a discovered workspace ID; `null`
means the startup workspace and remains a distinct cache identity. IDs and workspace
parameters are URI-encoded. The only global key is discovery. No key was renamed.

| Key                          | GET endpoint                         | Interval        | Enablement / override                                                                           |
| ---------------------------- | ------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------- |
| `['workspaces']`             | `/workspaces?refresh`                | 30s             | One app owner; readers disabled (no independent fetch policy)                                   |
| `['board', w]`               | `/board`                             | 5s              | Always in workspace dashboard; overview only while discovered running                           |
| `['agents', w]`              | `/agents`                            | 5s              | Workspace consumers; overview only while discovered running                                     |
| `['agent-options', w]`       | `/agent-options`                     | none            | Explicit enabled (default true); stale 30s, retry false; settings use running status            |
| `['agent-reply', w, id]`     | `/agent-runs/:id`                    | 5s when enabled | Explicit enabled; run details and proposals share these keys; terminal replies continue polling |
| `['views', w]`               | `/views`                             | 15s             | Always in workspace dashboard                                                                   |
| `['card', w, id]`            | `/cards/:id`                         | 5s              | While detail/inspector mounted                                                                  |
| `['graph', w, id]`           | `/cards/:id/graph`                   | 10s             | `id !== null`                                                                                   |
| `['notes', w, taskId]`       | `/cards/:cardId/tasks/:taskId/notes` | 5s when enabled | Expanded task only; existing key intentionally does not include cardId                          |
| `['reviews', w]`             | `/reviews`                           | 5s              | Workspace consumers (including sidebar)                                                         |
| `['review', w, id]`          | `/reviews/:id`                       | 5s              | Selected detail mounted                                                                         |
| `['review-comments', w, id]` | `/reviews/:id/comments`              | 5s              | Selected comments mounted                                                                       |

Unless listed, queries inherit retry 1, stale time 3s, structural sharing and Query's
mount/focus/reconnect defaults. Poll intervals do not imply background-tab polling.
No placeholder snapshot crosses workspace keys. Review proposals deduplicate all
runs targeting the review and poll each reply, preserving late terminal results.

## Checked mutation inventory

JSON content type and payloads are unchanged; mutations use Query's no-retry default
unless explicitly noted. Feedback stays in Query, not local copies of pending/error.

| Mutation / key              | Endpoint and input                                              | Cache, feedback and navigation semantics                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt (no mutation key)    | POST `/cards/:id/agent-runs`, `AgentPrompt`                     | Success tracks receipt for original non-null workspace even after composer unmount; seeds run reply; starts (does not await) agents invalidation. Composer controls request-ID reuse and navigation.                                                                                                                                                           |
| Save views (no key)         | PUT `/views`, `SavedView[]`                                     | Success replaces views cache; form owns visible error and closing behavior.                                                                                                                                                                                                                                                                                    |
| Labels (no key)             | PATCH `/cards/:id/labels`, `LabelChange`                        | Success seeds detail then **awaits** board invalidation; editor remains pending through refresh.                                                                                                                                                                                                                                                               |
| `['card-action', w]`        | PATCH `/cards/:id/lane`, `{lane}`; DELETE `/cards/:id`, no body | **Settled success or error awaits** board/card/graph/agents workspace-prefix invalidation. Explicit retry false. Latest mutation supplies feedback, all matching pending mutations supply lock. Successful delete clears only matching issue/graph URL selections, only if still in original workspace, with replace history; this reaction is in `use-cards`. |
| `['review-curate', w, id]`  | PATCH `/reviews/:id/comments`, `CurateReview`                   | Success **and error** start (do not await) comment invalidation. Draft acknowledgment remains explicit in existing composition/store.                                                                                                                                                                                                                          |
| `['review-publish', w, id]` | POST `/reviews/:id/publish`, `PublishReview`                    | **Settled success or error awaits** comments/detail/directory invalidation. Explicit retry false. Receipts, not presumed request outcome, are authoritative; drafts untouched.                                                                                                                                                                                 |

## Poll owners versus readers

- An owner mounts a domain query-options factory at the surface lifetime where
  freshness is needed. Query owns the timer, fetch status, retained data and cache.
- A cache/projection reader spreads that same options factory, overrides
  `enabled: false` **and** `refetchInterval: false`, and optionally adds `select`.
  It subscribes to owner updates but never fetches on mount/focus/reconnect or starts
  a timer. An explicit reader `refetch()` is still a user-requested fetch. Invalidation
  refreshes the active owner; a reader alone is not enough. Do not use `staleTime:
Infinity`, `subscribed: false`, or a new key as a substitute.
- Discovery is fully migrated: `WorkspaceDiscovery` is mounted once above Router;
  switcher (including desktop/mobile copies), default-workspace pinning and overview
  are readers. Opening a menu does not create another polling authority.
- `WorkspaceResourcePolls` is the selected-workspace owner for board, agents,
  reviews, and saved views. It remains mounted across issue, agent, and review modes,
  so sidebar counts and prompt notifications stay fresh in the background. Full-root
  `useBoard`, `useAgents`, and `useReviews` calls remain disabled readers
  for existing surface internals. `useSavedViews` reads the saved-view array directly
  (that response has no refresh timestamp). Shell code uses the concrete projection readers
  (`useBoardSnapshot`, `useBoardSidebar`, `useIssueBoard`, `useAgentIdentities`,
  `useReviewInboxCount`, `useSavedViews`, and status/workspace variants) so a changing
  root `fetchedAt` does not redraw unrelated content. Only the corresponding
  `use*Poll` calls in the owner establish timers.
- Multi-workspace overview uses `useQueries` with board and agent factories per ID,
  enabling only running weavers. It shares the same caches as workspace pages, not
  an overview cache. Keep per-source errors and retained snapshots independent;
  discovery failure is not a zero activity count. Offline snapshots remain visible
  but overview links remain unavailable. Its broader projection rewrite is rwq4x.

## Shell and page seams

`Dashboard` chooses overview versus a keyed workspace and owns only workspace
initialization. `DashboardShell` renders `DashboardSidebar`, `DashboardHeader`,
status/error feedback, the page slot, selection panels, and global dialogs. It does
not receive board/agent/review snapshots from a page. `DashboardOverlays` only
dispatches the active overlay; `SavedViewDialog` composes projected board/view readers,
the save mutation, URL selection commands, and the Zustand draft, while
`ShortcutDialog` subscribes only to browser preferences and their actions.
`IssueSurface()`, `AgentsView()`, and `ReviewsView()` are prop-free workspace page
entries; later surface work can change their queries and views without editing the
route shell. Reviews compose `ReviewInbox` and the query-independent `ReviewReport`;
`ReviewReportIntegrations` is the comments/prompt seam documented in
`docs/reviews.md`. `DashboardShell({ children: ReactNode })` is the explicit page slot.
`DashboardSidebar()`, `DashboardHeader()`, `DashboardOverlays()`, and
`WorkspaceResourcePolls()` are prop-free shell entries. IssueSurface renders Graph
before checking empty filtered cards, keeping graph focus usable even when filters
match nothing.
`WorkspacePage` gates startup on a boolean board-snapshot projection. Initialization
selects only workspace metadata; header/sidebar/dialog content selects cards, labels,
counts, identities, or saved views. Resource status consumers separately select
`fetchedAt` and read Query error/fetch state rather than threading metadata through
page props.

## Selection and composition conventions

Navigation commands come from action-only `useDashboardActions`; URL content comes
from the concrete scalar hooks in `src/lib/navigation.ts`. Commands whose result
depends on URL state use Router's functional current-search callback, never a closure
captured by a broad subscription. Use a module-level selector for fixed projections;
use `useCallback` with the actual inputs for parameterized selectors (see
`useFilteredCardCount`, `useSavedViewBoard`, and the workspace
switcher). Select nested content rather than selecting a root containing `fetchedAt`. Query
structural sharing retains unchanged branches; ordinary pure selectors should
return an existing reference when no transform is needed. Do not put query result
wrappers/arrays in derived-model dependencies or copy snapshots to Zustand.
Keep content and health subscriptions distinct, without hiding refresh errors or
safety-relevant fetching locks. No blanket memoization or global notification filter.
Zustand consumers select a relevant action, preference or keyed draft, not the whole
store. Existing broad surface subscriptions are subsequent feature work.

A controller/composition hook resolves URL/workspace and interaction state, invokes
concrete domain options, and delegates ordinary pure transforms. Views render named
domain values and explicit callbacks. Do not require a controller for trivial leaves
or replace the dashboard monolith with one omnibus controller. Shared leaves belong
under `src/components` (primitives under `ui`), never exported from a page for another
page to consume. Domain options must not import Router; navigation belongs in hooks.

For mutations, capture the workspace and resource at submission; never invalidate a
newly selected workspace on completion. Keep awaited versus fire-and-forget refresh
semantics deliberate. `cardActionMutationOptions` plus `useCardAction` is the concrete
request/composition example; existing mutation tests protect receipts and settlements.

For errors, distinguish no snapshot (loading/disconnected) from refresh failure with
data (retain it and label last-known). Empty means a successful empty snapshot, not
failure. The workspace switcher now preserves known choices with an explicit discovery
error, matching overview's retained-data policy; offline choices still navigate to the
existing disconnected workspace screen. No server restart is a verification technique.

### Issue surface models

See [issue surface handover](issue-surfaces.md) for the concrete board/outline/graph
contract and verification evidence. `useIssueBoard` selects only `board.cards`, then
memoizes `issueSurfaceContent(cards, filter)` on those actual inputs. Graph receives
stable `cards` and `allCards`; board rows receive explicit nullable parent context.
Detail notes, label editing and properties have focused component entries; mutation
controllers remain in `use-cards.ts`, with cache settlement in `api/cards.ts`.
