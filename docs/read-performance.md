# Dashboard read audit

## 2026-10-02 normalized agent directory transport

Selected the recurring full agent-directory response for `millhouse.spool` from the
current default performance log:

```text
2026-10-02T08:54:24.005Z perf SLOW 71.88ms server GET /api/agents status=200 bytes=1123304
2026-10-02T08:54:34.216Z perf SLOW 101.19ms server GET /api/agents status=200 bytes=1123304
```

The persisted projection contained 689 identities and 731 runs. Its HTTP shape embedded
713 complete run objects beneath participant identities and then sent the same records
again in the top-level run directory. The route now sends each run once and identity
records carry ordered run IDs; the client restores the existing `AgentDirectory` before
it reaches Query or domain consumers. This changes only the same-origin wire shape:
identity history, multi-participant runs, ordering, polling, cache keys and spool
semantics are unchanged. A boundary round-trip rejects a missing run reference rather
than returning incomplete data.

On isolated production servers against the real workspace, ten cold five-second reads
reduced the response from 1,123,304 to 655,523 bytes (42%). The route median moved from
55.70 to 48.86 ms and SLOW samples from 8/10 to 4/10 despite local SQL variance; median
post-SQL projection/serialization time moved from 19.95 to 17.66 ms. Decoding a fresh
response matched the old full directory exactly after ignoring its capture timestamp
(689 identities, 731 runs). Browser verification rendered all 689 identities plus
unbound runs, opened a real identity with its run history, and reported no uncaught
errors. The current and rotated UI logs and every live Weaver log reported by
`mill weaver list` were inspected; Weaver logs contained no query timings relevant to
this route. Focused agent projection checks passed, and `pnpm quality` passed formatting,
zero-warning Oxlint, strict TypeScript, 383 tests and the production build. No dependency
or Weaver runtime changed, so no Weaver restart was needed.

## 2026-10-02 provenance marker projection

Selected the recurring persisted provenance read for `millhouse.spool` from the
current default performance-log rotation:

```text
2026-10-02T07:50:28.321Z perf SLOW 130.43ms sqlite provenance workspace=millhouse.spool rows=8620 discover=0.11ms query=125.28ms decode=4.86ms outcome=ok
2026-10-02T07:50:43.789Z perf SLOW 109.30ms sqlite provenance workspace=millhouse.spool rows=8620 discover=0.09ms query=104.00ms decode=5.06ms outcome=ok
```

The snapshot SQL repeatedly looked up publication and `parent-of` endpoint markers in
correlated subqueries. It now aggregates the six candidate marker keys once and joins
that materialized marker set to both edge endpoints. The selected strands, allowlisted
attributes, edge rules and limits are unchanged. Sorted raw records matched exactly for
all five live workspaces (822, 721, 26,523, 3,760 and 8,620 records).

An isolated production server on port 4189 used `/tmp/w08kl-perf.log`. Nine warm real
`millhouse.spool` polls read the same 8,620 rows with a 28.35–39.79 ms SQL phase
(29.96 ms median); eight completed below the 50 ms end-to-end budget, and the remaining
61.36 ms sample included a 15.99 ms registry rediscovery while its SQL phase remained
39.79 ms. The Agents directory, one run inspector, the board and a 390×844 layout
rendered from real data without uncaught browser errors. Focused persisted-read tests
and `pnpm quality` passed (381 tests and production build). This changes only the UI
server's read query; no Weaver restart was needed.

## 2026-10-02 lazy unsupported reviews

Selected the recurring unsupported-review probe from the production perf log:

```text
2026-10-02T07:01:27.915Z perf SLOW 64.46ms strand strand review list workspace=millhouse.spool outcome=failed
2026-10-02T07:01:27.916Z perf SLOW 64.69ms server GET /api/reviews status=200 bytes=146
```

The current and rotated default logs contained 63 slow `review list` probes for
`millhouse.spool` at capture. The selected-workspace owner requested `/api/reviews`
every five seconds. Its server cache returned the known unsupported directory cheaply
for one minute, then retried the absent operation and produced another 62–120 ms slow
sample. Relevant Weaver logs showed a running `millhouse` generation and no current
runtime error; the operation itself is not registered in that workspace.

`reviewsQueryOptions` now disables its periodic interval after the server returns the
explicit `unsupported` directory. Available review directories retain their five-second
poll. Focus/reconnect refreshes and workspace lifecycle invalidation remain available,
so a changed Weaver can be checked without a permanent negative capability cache.
Server detection, review domain commands, cache keys and unsupported UI semantics are
unchanged.

Browser verification used the production build on port 4188. On real
`millhouse.spool`, the unsupported state rendered as **Reviews are not configured**
and made one review request while board and agent requests each advanced from four
to seven. A routed available response made three review requests at the normal
five-second cadence. No uncaught browser errors occurred. Focused review, polling and
server-cache checks passed (20 tests). `pnpm quality` passed formatting, zero-warning
Oxlint, strict TypeScript, 379 tests and the production build. No Weaver restart was
needed for this client-only change.

## 2026-10-02 lazy run replies

Selected one real slow read from the rotated production perf log:

```text
2026-10-02T05:22:57.911Z perf SLOW 458.10ms strand strand agent show workspace=millhouse.spool bytes=767 outcome=ok
2026-10-02T05:22:57.913Z perf SLOW 460.04ms server GET /api/agent-runs/k3btg status=200 bytes=270
```

Run inspectors previously mounted the prompt/reply query immediately and polled it
throughout inspection, including when the user only wanted the session log.
`AgentRunReply` now starts with a collapsed **Prompt and agent reply** disclosure.
Only its expanded content mounts the existing query; closing it stops that observer
without clearing cached replies. The server still uses the same `agent show` and
`show` operations. No new SQL, cache keys, or downstream semantics were introduced.
Workspace status/log polling and review proposal readers are unchanged. Visible
terminal replies still poll for late results; requests already in flight may finish.

Browser verification against live `millhouse.spool` run `k3btg`, using the production
build on port 4174:

- Initial collapsed inspection issued **zero** `/api/agent-runs/` requests while
  run status, participants and session logs rendered normally.
- Opening the disclosure loaded the real final reply and continued polling. Eight
  observed reads took 154–248 ms each; this change avoids unnecessary calls rather
  than claiming to speed up the command itself.
- Closing it produced **zero reply requests over 11 seconds**, while the workspace
  agent directory refreshed twice. Reopening loaded the reply normally.
- Aborting reply refreshes retained the previous reply with explicit last-successful
  feedback and Retry. Removing the browser override and retrying recovered it.
- Enter/Space operated the disclosure and retained keyboard focus. Desktop light
  (1440×1000) and narrow dark (390×844) layouts remained readable. Board search,
  label filters, card/Notes navigation and Graph task visibility also passed smoke
  checks without editing real cards. No uncaught browser errors.

`pnpm quality` passes formatting, zero-warning Oxlint, strict TypeScript, 378 tests
and production build. Focused checks protect the initially unmounted query surface,
cache/error retention across closure, and fetching late terminal replies on reopening.

## 2026-10-02 selected-workspace discovery cadence

The hourly audit inspected `~/.local/state/millstrand-ui/perf.log`, its active
rotation, and the `millstrand-ui` and `skein-src` Weaver logs reported by
`mill weaver list`. The Weaver logs contained no query timings; the UI perf log
showed selected-workspace resource polls running registry discovery about every
five seconds. One representative sample was
`2026-10-02T05:39:37.997Z perf SLOW 235.44ms mill weaver list (discovery)
bytes=8030` while `skein-src` board, agent, review, and log-activity requests were
settling. This was not the app's 30-second `/api/workspaces?refresh` poll, whose
samples fell at `:20` and `:50` in that interval.

`WorkspaceDirectory.select` called the expiring `list()` cache for every selected
resource. Its five-second lifetime matched those resource poll intervals, so the
first route in each poll group launched another `mill weaver list`. Selection now
reuses the last successful registry snapshot. The app-lifetime
`WorkspaceDiscovery` query remains the explicit 30-second refresh owner, forced
refresh still replaces the snapshot. A lifecycle attempt clears it before the
command starts, rejects selected-workspace access until settlement, and clears it
again because success and failure both require fresh status.

An isolated production server on port 4175 used `/tmp/auto-647i2-perf.log` while
a browser loaded the real `skein-src` board. The page showed 45 active issues and
32 active agents. Across 11 board requests, 11 agent requests, and 11 log-activity
requests, discovery ran only at `05:48:03.372Z` and `05:48:33.397Z`, alongside the
two expected 30-second `/api/workspaces` polls; no selected-resource poll added a
discovery call. `pnpm vitest run server/workspaces.test.ts` passes all eight tests,
protecting the ownership boundary with a virtual clock and lifecycle concurrency
with a controlled promise. No Weaver dependency or runtime changed, so no Weaver
restart was needed.

## 2026-09-27 request budget audit

Measured against live `agents`, `millhouse`, `millstrand-ui`, `notes` and
`skein-src` workspaces on a busy local machine. Values are local samples with
visible variance, not latency guarantees.

### Request budget instrumentation

Every request is timed against a 5 ms warning and 50 ms slow budget in
`shared/perf.ts`. `server/perf.ts` appends one line per sample to
`~/.local/state/millstrand-ui/perf.log` (override with `MILLSTRAND_UI_PERF_LOG`,
rotated at 5 MiB) and repeats warning tiers on the console; browser fetches use
the same format through `src/lib/api/perf.ts`. Samples cover HTTP routes (status
and response bytes), `strand` CLI calls, `mill weaver list` discovery, persisted
SQLite reads (row count plus discover/query/decode split) and session-log
snapshots. Deliberately long weaver lifecycle calls are marked expected; an SSE
stream is measured through setup only.

Logging is an instance dependency: the shared `PerfLogger` contract has just
`record(measurement)`. Server library constructors accept `{ logger }` and default
to `nullPerfLogger` (no files or console output). `server/index.ts` creates the
file adapter and passes it through discovery, workspace clients, database reads
and session logs; there is no mutable global sink. Only output adapters add
wall-clock timestamps.

Tests that need logging assertions pass `new MemoryPerfLogger()` and inspect its
`samples`; ordinary tests omit the logger. Browser transport tests use
`createRequest()` (silent) or `createRequest(logger)` (capture), while the exported
production `request` uses the console adapter. Only the file-adapter tests write
perf logs to temporary directories; consumers need no logger mocks or cleanup.

The 2026-09-28 DI follow-up passes `pnpm quality` (369 tests). A production-server
browser smoke exercised board search, card selection/Notes, Graph and a 390×844
layout against the real UI workspace; all five server scopes and browser fetch
samples still reached their configured adapters, with no uncaught browser errors.

### Findings and changes

- The board poll ran `strand kanban board --all true` and then hydrated the same
  persisted attributes (69 ms on agents, 163 ms on millstrand-ui, 493 ms on
  millhouse, 796 ms on skein-src). `StrandData.board` now builds membership,
  attributes and epic annotation from the persisted snapshot; its one
  `strand help kanban` capability probe per workspace keeps the non-Kanban error
  visible. Direct comparison matched the spool board exactly on all five live
  workspaces (15 / 159 / 83 / 5 / 944 card ids and every epic annotation).
- Every persisted read re-ran `mill weaver list` (8–25 ms). `WorkspaceDatabase`
  now caches the discovered database path for 30 s per workspace and coalesces
  concurrent discovery; a failed read rediscovers immediately.
- The provenance edge projection built a temporary B-tree for an order no
  consumer needs; it is gone.
- `/api/dependencies` serialized the whole workspace graph (up to 5,045 KB and
  199 ms on skein-src) while `dependencyLayout` only used one-hop edges of the
  expanded cards. The endpoint now takes bounded `card` parameters, selects only
  incident `depends-on` edges, and keeps workspace-wide incoming/outgoing counts
  for the returned endpoints in the same read.
- Workspaces without the review spool paid a failing `strand review list` every
  poll (62–154 ms). The unsupported answer is now retained for 60 s.

### Measurements

| Read                                     | Before                   | After (warm samples)          |
| ---------------------------------------- | ------------------------ | ----------------------------- |
| agents board poll                        | 69 ms CLI + 20 ms SQL    | ~5–30 ms SQL, one 28 ms probe |
| millhouse board poll                     | 493 ms CLI + 53 ms SQL   | ~30–55 ms SQL                 |
| skein-src board poll                     | 796 ms CLI + 128 ms SQL  | ~110–160 ms SQL               |
| `mill weaver list` per persisted read    | 8–25 ms                  | ~0.1 ms cached (30 s)         |
| `/api/dependencies` skein-src (one card) | 5,046,755 bytes / 199 ms | 648 bytes / 3 ms              |
| unsupported `/api/reviews` poll          | 62–154 ms CLI            | cached answer (<1 ms)         |

### Remaining costs

The board remains above the 50 ms budget on millhouse and skein-src because the
shared provenance snapshot covers every card, task, identity, claim and run in
one read. `depends-on` edges stay in that snapshot: a per-endpoint count record
cost as much as the edges it replaced (26,118 to 27,136 rows on skein-src), so
the edges remain the cheaper projection.

The remaining >50 ms calls are domain commands fetched only for a selected card:
`kanban card` (~20–87 ms), `notes` (~15–66 ms) and `kanban-export` (~18–79 ms),
plus the one-time `help kanban` probe (15–70 ms per workspace and process).
Replacing them with SQL would duplicate spool task, readiness and relation rules,
so they stay command-owned.

### Verification

`pnpm quality`: formatting, zero-warning type-aware Oxlint, strict TypeScript,
366 tests and the production build pass. The board rewrite was compared directly
against `strand kanban board --all true` on all five live workspaces; membership
and every epic annotation matched (15 / 159 / 83 / 5 / 944 cards). Browser checks
on live skein-src at 1440×1000 and 390×844: the board renders lanes, labels,
owners, auto-run and dependency counts; card detail and Notes render; Graph
expands `jxjwf` with one 729-byte scoped dependency read; the narrow layout stacks
without losing controls. The browser console showed only the expected client perf
tiers and no uncaught errors.

## 2026-09-21 audit (historical)

Measured on 2026-09-21 against live Codethread and Millstrand UI workspaces.
All measurements used read-only SQLite connections or GET endpoints; no workspace
fixtures, mutations, or weaver restarts were needed. Values are local samples, not
latency guarantees. Direct SQL samples used one warm-up and three measured reads.

### Findings and changes

- Board, agents, and log activity independently hydrated the same persisted graph.
  Log activity even created a new database client each request. They now share one
  short-lived parsed snapshot per workspace; concurrent misses coalesce.
- Codethread's snapshot had 2,479 strands, including 1,554 notes. None of the
  background projections needed notes, so shared provenance now excludes them.
  Note readers load identity/attribution metadata only for returned note IDs;
  text/time/kind continue to come from the notes domain command.
- Role lookups repeatedly scanned every edge, and log summaries projected the agent
  directory twice. Source/target indexes and snapshot-local agent memoization remove
  that repeated work without changing authoritative ownership/attribution rules.
- Card detail fetched full notes every five seconds even on Overview, Agents, or
  Attributes. Full notes now have a separate endpoint and Notes-tab-only query.
  Details retain their normal poll; task notes were already expanded-row-only.
- Graph dependency expansion, card Agents-tab graphs, task notes, agent replies,
  and session streams already have deliberate surface/request enablement. Workspace
  board/agent/review/view/log poll owners remain unchanged: their consumers include
  sidebar counts, badges and activity hints across page modes.

### Measurements

These figures are the original 2026-09-21 audit results. They predate the later
removal of note strands from shared provenance and are retained as historical
samples rather than estimates of the current scoped query.

| Read                                                     | Before                      | After                                                   |
| -------------------------------------------------------- | --------------------------- | ------------------------------------------------------- |
| Codethread serialized provenance                         | 2,200,561 bytes             | 827,296 bytes (62% smaller)                             |
| Codethread SQL-only median                               | 27.3 ms                     | 19.6–20.1 ms                                            |
| Codethread snapshot including discovery/decode           | 42.4 ms                     | 32.6–32.8 ms                                            |
| UI workspace serialized provenance                       | 698,799 bytes               | 490,008 bytes (30% smaller)                             |
| UI workspace SQL-only median                             | 11.7 ms                     | 12.4 ms (essentially unchanged)                         |
| Fresh simultaneous board + agents + provenance consumers | Separate reads per consumer | One underlying persisted read                           |
| Log activity after shared snapshot load                  | Another snapshot/index      | No extra DB reads; 1–1.5 ms local sample                |
| hqqrk detail payload                                     | 96,059 bytes                | 73,453 bytes; 22,597-byte full notes fetched separately |

The fresh-instance burst used the existing injected persisted-read interface to
count actual DB calls, without global monkey-patches. Notes and details each took
roughly 275–297 ms on fresh instances; they remain CLI-dominated. Live HTTP warm
samples were contaminated by normal browser polling and are not presented as cold
speedups. The UI database changed by two strands/edges between samples; Codethread
row counts were unchanged. Dependency SQL and its bounds were unchanged.

### Verification

`pnpm quality`: 386 tests, formatting, strict TypeScript, zero-warning Oxlint and
production build pass (existing large-bundle advisory remains). Tests protect
shared-read coalescing/failure recovery, fresh mutation validation/invalidation,
metadata-only note allowlists, lazy full-note reads and attribution, hidden-query
invalidation, and existing graph/ownership behavior.

Browser checks on real `hqqrk`:

- Opening Overview made zero full-note or descendant-graph requests.
- Opening Notes made one request and rendered nine notes with their attribution.
  Returning to Overview made zero additional note requests over 11 seconds;
  the loaded count stayed visible.
- Aborted refresh retained all nine notes with last-known feedback. An initial
  failed load did not show a successful empty list. Removing the route override
  recovered notes through polling without restarting the server.
- Notes URL/reload and the Agents tab remained functional; no real edits or agent
  launches were used for these checks. Browser request overrides were removed.

Shipping follows the repository-owned landing workflow after the user’s explicit approval.
