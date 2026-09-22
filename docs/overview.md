# All-weaver Inbox

The overview (`/?mode=overview`) is a three-column cockpit: thin workspace navigation,
attention/review/quiet-agent rows in the centre, and recorded agent activity on the
right. On narrow screens these stack above the fleet. There are no aggregate tiles
or design-preview controls.

## Attention and navigation

- **Needs your attention** matches any configured label on an active card, including
  refinement and pending cards. Closed cards never return. Its settings button opens
  one global label list for every visible Kanban-enabled weaver, not per-weaver rules.
  Defaults: `human-attention`, `agent-blocked`, `needs-decision`, `factory-escalated`.
- An empty label list disables attention matches. Matching review cards appear only
  in attention; other `in_review` cards appear under **Ready for a look**.
- `attention-store.ts` owns the editor and the browser-local
  `millstrand-ui-attention-labels` key. Storage events update other tabs. Failed saves
  retain the draft and prior selection; malformed/unreadable saved preferences show
  an explicit warning. These preferences do not edit workspace labels or sync devices.
- Fleet search and workspace/section filters live in `cockpit-store.ts`. Pins and
  hidden weavers continue to use the existing workspace preference store and poll
  exclusions. The left rail and fleet open the real workspace dashboard.
- Card/agent selection stays in Router search over the overview, using the existing
  `IssueDetail` and `AgentDetail` side panels. Back restores selection/navigation.
  Log hints, compact tails and the expanded viewer reuse the existing components.

## Data ownership

`useOverview` remains the sole overview board/agent poll owner, mutually exclusive
with `WorkspaceResourcePolls`. Discovery belongs to `WorkspaceDiscovery` and logs to
`OverviewLogPolls`. Running workspaces poll every five seconds; offline workspaces
retain snapshots without fetching. Hidden workspaces are excluded by the shared
`useVisibleWorkspaces` projection.

The board selector uses `overviewCards(cards, attentionLabels)` to keep moving work
and configured asks. Changing preferences reprojects the same cache immediately.
`useCockpit` combines concrete snapshots with disabled log-activity readers, using
`cockpitWork` and `agentPulse` from `src/lib/overview.ts`. It introduces no query keys
or duplicate poll owners. Its 30-second display clock only ages recorded events.

Quiet means a running process whose latest recorded event is at least five minutes
old, not proof it is stuck. Missing, malformed or stale log evidence never establishes
quietness. Card and agent failures remain independent: missing Kanban does not hide
agents. Retained failed/offline cards and agents are explicitly last-known, and source
errors remain visible. Refresh all invalidates discovery and running board/agent keys.

## Weaver lifecycle

Gear menus and the fleet controls dialog expose confirmed start, stop and restart.
These operate the workspace weaver, not individual agents. The server accepts only
`WeaverOperation` through `POST /api/workspaces/:id/lifecycle`, resolves the discovered
ID to its canonical path (including offline entries), then executes the fixed
`mill weaver <operation> --workspace <path> --json` argument vector without a shell.
Unknown IDs and invalid operations fail before execution. The subprocess has a
330-second budget around mill's default five-minute readiness wait.

`weaverMutationOptions` owns pending/error/success feedback, disables automatic retries,
and awaits discovery plus selected-workspace cache invalidation on either outcome.
Menus lock while their workspace has a pending command. The UI never fabricates an
online/offline result. Closing the confirmation does not cancel a submitted command;
refresh status before explicitly retrying a failure or timeout.

This is the existing unauthenticated trusted-LAN API. Anyone able to reach it can
operate discovered weavers; use localhost/SSH when the network is not trusted.

## Verification

`pnpm quality`: formatting, zero-warning type-aware lint, strict TypeScript, 345 tests,
and production build (existing large-chunk advisory only). Focused additions cover
custom labels across workspaces, empty labels/review precedence, closed-card exclusion,
quiet evidence, known-ID lifecycle resolution and failed-command cache expiry.

Built-app browser checks at 1440×1000 and 390×844: no horizontal overflow, light/dark,
settings save/reload, invalid labels, empty list, storage failure preserving the draft,
search and filters, pin/hide/unhide, real workspace navigation, existing issue/agent
inspectors, Back and expanded activity. Aborted board reads retained last-known cards
while agents stayed live. Browser-intercepted lifecycle success and network failure
exercised confirmation and feedback without starting/stopping/restarting real weavers.
