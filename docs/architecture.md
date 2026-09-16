# App architecture and data contract

This is the implemented foundation for epic 2648y, not a second state framework.
Import concrete modules below; there is no `src/lib/api.ts` facade.

## Module map

| Home                                                                                                                    | Owns / public entry points                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/api/transport.ts`                                                                                              | `request`: same-origin `/api`, workspace query parameter, HTTP errors, the documented endpoint-contract assertion at `response.json()`                 |
| `src/lib/api/query-client.ts`                                                                                           | `createQueryClient`: one app client, query retry 1 and stale time 3s; mounted in `src/main.tsx`                                                        |
| `src/lib/api/workspaces.ts`                                                                                             | `workspaceQueryOptions`, `workspaceReaderOptions`, `useWorkspaces`: global discovery and cache readers                                                 |
| `src/lib/api/cards.ts`                                                                                                  | `boardQueryOptions`, `cardQueryOptions`, `graphQueryOptions`, `taskNotesQueryOptions`, `labelsMutationOptions`, `cardActionMutationOptions`            |
| `src/lib/api/agents.ts`                                                                                                 | `agentQueryOptions`, `agentOptionsQueryOptions`, `agentReplyQueryOptions`, `agentPromptMutationOptions`; receipts stay tied to the submitted workspace |
| `src/lib/api/views.ts`                                                                                                  | `viewsQueryOptions`, `saveViewsMutationOptions`                                                                                                        |
| `src/lib/api/reviews.ts`                                                                                                | `reviewsQueryOptions`, `reviewQueryOptions`                                                                                                            |
| `src/lib/api/review-comments.ts`                                                                                        | `reviewCommentsQueryOptions`, `curateReviewMutationOptions`, `reviewPublishMutationOptions`                                                            |
| `src/hooks/use-workspace.ts`                                                                                            | Narrow Router workspace selector                                                                                                                       |
| `src/hooks/use-cards.ts`, `use-agents.ts`, `use-views.ts`, `use-reviews.ts`, `use-review-comments.ts`                   | React composition: resolve workspace, mount queries/mutations, dependent queries, route reactions. Existing product components import these hooks.     |
| `src/components/workspace-discovery.tsx`                                                                                | Single app-lifetime discovery poll owner, mounted in `src/main.tsx`                                                                                    |
| `src/components/workspace-switcher.tsx`                                                                                 | Working pilot: selected option and filtered options use `select`; separate discovery health reader; URL-owned switching                                |
| `src/lib/workspaces.ts`                                                                                                 | Pure `selectedWorkspace` and `matchingWorkspaces` projections                                                                                          |
| `src/components/markdown.tsx`                                                                                           | Shared page-independent Markdown leaf; no issue-detail dependency                                                                                      |
| `src/lib/board.ts`, `agents.ts`, `reviews.ts`, `review-comments.ts`, `review-publication.ts`, `overview.ts`, `graph.ts` | Pure domain projections and rules; extend these homes for later surfaces, not API modules or another selector framework                                |
| `src/lib/navigation.ts`, `dashboard-search.ts`                                                                          | Router composition/actions and URL schemas/destination transforms respectively                                                                         |
| `src/store.ts`, `agent-prompt-store.ts`, `review-comment-store.ts`                                                      | Shared interaction state, preferences/receipts, and keyed persisted drafts; never mirrored server snapshots                                            |

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
- Other surfaces deliberately retain their existing observer lifetimes/intervals
  in this foundation. Shell feature 216lz will establish their single owners and
  convert shared badges/sidebar/content to readers together. Do not turn off an
  existing owner until all required background sidebar/notification data remains fed.
- Multi-workspace overview uses `useQueries` with board and agent factories per ID,
  enabling only running weavers. It shares the same caches as workspace pages, not
  an overview cache. Keep per-source errors and retained snapshots independent;
  discovery failure is not a zero activity count. Offline snapshots remain visible
  but overview links remain unavailable. Its broader projection rewrite is rwq4x.

## Selection and composition conventions

Use a module-level selector for fixed projections; `useCallback` with the actual
inputs for parameterized selectors (see switcher's selected option and search).
Select nested content rather than selecting a root containing `fetchedAt`. Query
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
