# Multi-workspace overview

## Ownership and public contracts

- `src/hooks/use-overview.ts`: `useOverview()` owns the overview's board/agent
  queries. Dashboard renders Overview **instead of** WorkspacePage, so it never
  competes with `WorkspaceResourcePolls`. Each discovered ID uses the ordinary
  `boardQueryOptions(id)` and `agentQueryOptions(id)` cache keys. Running weavers
  poll every 5s; offline weavers retain cached data without fetching.
- Stable selectors call `overviewCards(board.cards)` (the board domain's
  `selectCards` with claimed/review/production lanes) and
  `activeAgentIdentities(directory.identities)`. Stable combine functions remove
  query wrappers, timestamps and fetch functions; Query structurally shares the
  resulting concrete arrays. `useMemo` composes those arrays and workspace options,
  not unstable `useQueries` result arrays. No new cache or server endpoint exists.
- `src/lib/overview.ts`: `CardActivity`, `AgentActivity` and `ActivityHealth`
  distinguish null (no successful snapshot), empty arrays (successful empty), and
  independent live/loading/failed health. `workspaceActivity` adds online/offline
  workspace status; `overviewActivity` groups busy/other and totals available
  snapshots once. Failed/offline retained work stays busy. Counts include retained
  work and are labeled partial; a missing source displays `—`, not zero.
- `src/components/workspace-activity.tsx`: `WorkspaceActivity({ activity, onRetry })`
  renders the model and delegates retry. It imports only public shared
  `WeaverAgentSetting` and destination helpers, never the Agents/Board pages.
  `overview.tsx` owns page composition, discovery feedback and quiet expansion.

Example pure composition (inputs are already active projections):

```ts
const model = workspaceActivity(
  workspace,
  { data: retainedCards, health: { kind: 'failed', message: 'Cards disconnected' } },
  { data: activeIdentities, health: { kind: 'live' } },
);
const summary = overviewActivity([model]);
// model.board remains last-known; model.agents remains live.
// summary.partial is true and retained cards still contribute to summary.cardCount.
```

Discovery health is returned separately from activity. A discovery failure retains
known options and marks page totals partial without falsely declaring each source
failed. Refresh all invalidates discovery and the currently running board/agent keys;
newly discovered workspaces mount their own queries. Per-source retry invalidates
only its workspace key. No offline retry is enabled. Options changes rebuild both
query lists by ID; ordering is used only to zip each list's guaranteed input-order
results, never as cache identity.

`workspaceActivityDestination` remains authoritative for shareable workspace/card/
agent URLs and returns null for offline weavers. Offline rendering contains no
workspace/card/agent anchors. Alias preferences remain owned by the agent store and
public setting component. Refresh does not replace browser drafts or preferences.

## Verification

`pnpm quality`: formatting, zero-warning Oxlint, strict TypeScript, 292 Vitest tests
and production build. Existing board and destination tests protect production lane
sorting and URL/offline semantics; new overview and workspace-activity tests protect
partial counts, unavailable versus empty, independent health, offline labels and
retry/navigation suppression.

Browser: isolated agent-browser session, built app on 127.0.0.1:4276, desktop
1440×1000 and narrow 390×844. Real reads discovered seven running local weavers:
active cards/agent, six quiet workspaces, quiet expansion, Refresh all, card and
agent links in new tabs, and alias change/reload persistence passed. Narrow layout
has document width 390, no horizontal overflow. Initial discovery/loading was
observed before real snapshots arrived.

Browser-local network boundaries (no Weaver shutdown or real writes):

- Card request aborted after success: retained cards/counts and last-known labels;
  agents remained live. Agent request aborted separately: retained agent data.
- Discovery aborted: retained workspace list with explicit discovery error and
  partial totals; independent sources continue.
- Discovery fixture marks the active workspace offline: retained work remains
  visible; zero anchors target that workspace. Refresh restores live links.
- Response fixtures show production work plus queued and stopping agents; totals
  and labels remain correct. Empty discovery fixture shows the explicit empty state.

Fixtures existed only in browser request routing and were removed. No paid agents,
external reviews, real card edits or weaver stops.
