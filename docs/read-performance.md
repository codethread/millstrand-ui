# Dashboard read audit

Measured on 2026-09-21 against live Codethread and Millstrand UI workspaces.
All measurements used read-only SQLite connections or GET endpoints; no workspace
fixtures, mutations, or weaver restarts were needed. Values are local samples, not
latency guarantees. Direct SQL samples used one warm-up and three measured reads.

## Findings and changes

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

## Measurements

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

## Verification

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

Shipping follows the shared landing workflow after the user’s explicit approval.
