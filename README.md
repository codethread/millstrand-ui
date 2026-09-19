# Millstrand UI

A web interface for exploring Millstrand workspaces. It covers Kanban cards,
tasks, dependencies, activity, agents, and their recorded dialogue through a local
Node server. Card lanes, card labels, and saved dashboard views are editable; cards
can also be deleted.

|                                                                                                                         |                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ![visible ui showing the kanban board](https://github.com/user-attachments/assets/b34a3284-f22f-4de0-a94e-8b84ed54e24b) | ![focussed view of card](https://github.com/user-attachments/assets/23c46da0-6ed2-4e01-949e-aab4d2a0593b) |
| ![graph view](https://github.com/user-attachments/assets/c58e5fa9-9445-4576-93f7-4144d90d3d19)                          |

## Run

Install Node.js 24.21.0 (LTS) or newer, pnpm, `mill`, and `strand`. Start the workspace weaver as
you normally would, then run:

```sh
pnpm install
pnpm build
pnpm start
```

This installs the dependencies, builds the SPA, and serves both the app and API
on port **4173**, bound to `0.0.0.0`. Open `http://localhost:4173` on the host or
`http://<host-lan-address>:4173` from another computer. Leave the process running;
Ctrl-C stops it. Allow the port through the host firewall if necessary.

```sh
pnpm start --port 4180 --workspace /path/to/project
```

The default workspace is the canonical Git checkout, shared across linked worktrees. `WORKSPACE` accepts a
project directory or its `.millstrand` directory. The server also accepts
`--workspace`, `--host`, and `--port`, or `MILLSTRAND_WORKSPACE`,
`MILLSTRAND_UI_HOST`, and `MILLSTRAND_UI_PORT` environment variables.

## SSH

Run the server in your usual persistent SSH terminal session. To use an SSH
tunnel instead of a direct LAN connection:

```sh
# On the remote host
pnpm start --host 127.0.0.1

# On your local computer
ssh -N -L 4173:127.0.0.1:4173 user@host
```

Open `http://localhost:4173` locally. This MVP has no login: any client able to
reach the server can browse discovered local weavers, move or delete cards, edit
card labels and saved views, and read private recorded prompts, commands, and paths.
That includes the session-log source endpoints when a client knows a provider and
session ID. Bind to localhost when using a tunnel or when the network is not trusted.

## All-weaver overview

The home page (`/?mode=overview`) shows work in motion across every discovered
local weaver: only in-progress/review/production cards and active agents (running, queued,
or stopping). Busy workspaces appear first, with summary counts; quiet, loading,
and offline weavers are listed compactly below. Expand one to inspect its status
or open its dashboard. **All weavers** in any dashboard returns to this overview.

Card and agent links open the correct workspace and selected item, including in
a new tab. Activity polls every five seconds and discovery every thirty seconds;
**Refresh all** requests both immediately. Failed sources retain their last
successful snapshot with explicit last-known labels. Counts are marked partial
when a source is loading, offline, or failing. Offline snapshots remain visible,
but their workspace, card, and agent links stay unavailable until discovery sees
the weaver running again. A missing Kanban surface does not prevent that weaver's
agents from appearing.

## Switch weavers

The workspace menu lists local weavers discovered by `mill weaver list`. Selecting
one changes that browser's board, details, graphs, and saved views. Selection is
stored in the URL, and other browser sessions keep their current workspace. The
server's `--workspace` option selects the initial default. Weavers without Kanban
show an error with the workspace menu still available.

## Labels and saved views

Label edits use `strand kanban label add/rm`, so they persist in the workspace
and appear in the terminal dashboard too. Label slugs use lowercase letters,
numbers, and hyphens. Title, body, ownership, and graph links are otherwise read-only in this app.

Right-click a Board card or Outline feature row, or use its **…** actions button,
to move it to another lane or delete it. The current lane is disabled. The button
also provides touch and keyboard access. Moves edit only that card's state/lane:
Completed closes it with outcome `done`; other lanes reactivate it and clear closure
metadata. The server uses `strand update` for these simple lane changes, not the
removed Kanban promote/review/rework commands. These are board edits, not workflow
transitions: they do not assign an owner, run landing, or change child cards/tasks. Filters remain unchanged, so a moved
card may disappear from the current view. Deletion requires confirmation and permanently
removes only that card and its incident links through `strand burn`; child cards and
tasks remain. Failed actions are shown without automatically retrying them.

Custom views persist on the **server**, shared by browsers viewing the same
workspace. They live in
`${XDG_CACHE_HOME:-$HOME/.cache}/millstrand/millstrand-ui/views.json`, keyed by the
absolute `.millstrand` path. Web views are separate from the terminal
dashboard's saved views. Included labels combine with ALL or ANY matching;
excluded labels always remove a match. Views can also narrow the board using
search, status, issue type, and priority.

## Auto-run properties

Board cards show auto-run opt-in, configured seat alias, effort, delivery workflow,
and dispatcher status separately from agent badges. Open the card for the recorded
Harnesses assignment, workflow run, dispatch error, and dispatch branch/worktree
snapshot. These are read-only properties, not controls for launching work.

The `auto-run` label opts a card in; it does not confirm eligibility or worker activity.
`preparing`, `assigned`, and `error` describe the dispatcher, not the worker lifecycle.
Configuration and dispatch history remain visible even after opt-out. Use the existing
agent badges and Agents view for actual worker status.

## Automatic card delivery

Opted-in pending features can be picked up automatically with a planner-selected
seat, effort, and repository delivery workflow. The default prepares a passing PR
with a C4-level walkthrough, browser evidence and screenshots where applicable,
then stops for human review. An explicitly selected full-land workflow hands shared
landing to a canonical-root grunt after review but before sign-off. The grunt waits
for the implementation worker to settle before merging and removing its worktree;
card completion follows cleanup.

Select `auto-inspect` for investigations, audits, exploratory reviews, and bounded
regression checks whose primary output is card evidence. It records a structured
summary and routes clean work to a no-PR completion, ambiguous findings to review,
and blockers to an open card. If inspection produces a bounded fix, its
`auto-run/on-change` policy is `human-review`, `full-land`, or conservative `stop`
by default; quality always runs before a changed path proceeds. Observed autonomous
delivery failures—not ordinary product findings—are labeled `auto-run-failure` and
left for manual intervention. Configuration lives in version-controlled
`.millstrand` modules; see [automatic delivery](docs/auto-run.md) for setup and
operation.

## Agents and identities

Open **Agents** in the sidebar to search identities, harness aliases, providers,
and models. Running and queued sessions sort first; **Active only** hides terminal
and untracked sessions. Click an identity or an issue’s agent badge to inspect its
provider/model, effort, working directory, run history, and owned work. Identity
details and the Agents surface have shareable URLs and support browser Back.

The UI joins card/task `owner` values to `identity/id`, then resolves published
runs carrying that identity to `harness/alias`. **Working** requires a running run
explicitly targeting the item or its work root. **Session running** only proves
that the owner’s tracked session is running, not that it is working on every owned
issue. Queued, stopping, completed, failed, and untracked sessions remain distinct.
These are Weaver’s recorded process states, not keystroke or model-token activity.

Agent data refreshes independently every five seconds; failed refreshes mark
retained data as last-known rather than claiming it is live. Agents can be browsed
even when a workspace does not publish Kanban. The server discovers the workspace's
file-backed SQLite database through `mill weaver list`, then runs a short-lived,
read-only SQL projection over committed persisted state. It selects identity sessions,
identity-linked published runs, and owned work before assembling only the required
attributes. Unrelated notes, events, artifacts, provider environment variables,
injected prompts, and credentials are never selected. The query has a 10,000-row
safety bound, retains every lifecycle state including completed history, and fails
rather than truncating or accepting an unsupported storage/schema version.

Use **Prompt agent** from a card's detail panel in Board, Outline, or Graph (or a
focused graph's strand inspector). The small compose dialog starts a headless
`strand agent run` in that weaver and opens its existing Agents detail view.
That view shows your prompt, the tracked status, a link back to the work, and the
reply when available. Each submission starts a new run; there are no stop,
assignment, or session-resume controls. A failed run can still have a useful reply,
which is shown alongside its failure.

The default alias is **tui**, saved separately for each weaver in this browser.
Change it on All weavers or in the compose dialog. Choices come from that weaver's
available headless harnesses; missing Harnesses support or an unavailable alias
is shown explicitly. Prompts are passed as command arguments, never shell code;
the API validates the selected card/graph target and alias and owns the execution
directory, using the card’s recorded worktree when it is registered in the same
repository (otherwise a card without a worktree uses the weaver root). Retries of an unchanged submission reuse the CLI request ID.

### Session logs

Standard `pnpm dev`, `pnpm build`, and `pnpm start` include agent session logs; there
are no enable flags or separate log servers. Overview and agent surfaces show a
compact latest-event hint, while cards and agent details provide compact tails and an
expanded **Conversation**, **Inspector**, or **Console** viewer. Card log rosters
combine current feature/task owners with linked runs, retain terminal work under
**Past work**, use a mobile selector on narrow layouts, and expose related task
context in a popover.

Logs are linked only by persisted session IDs and providers. A running published
run's `harness/session-id` is available before native identity attachment; otherwise
the identity's `identity/native-session-id` or newest published run session is used.
They read the final 1 MiB of the corresponding JSONL file in
`~/.local/state/{pi,codex,claude}-dialogue`, retaining at most 400 complete records.
A log is the native session, not a task-exclusive history, and it does not provide
whole history, token output, reasoning, or full tool stdout/stderr. See
[session logs](docs/session-logs.md) for endpoints, retained-data behavior, and the
LAN exposure warning.

The header's agent icon tracks prompts sent from this browser in the current
weaver. It shows active runs and unread finished runs (including failures).
Choose a notification to open that exact run; viewing its finished reply marks
it read. Launch receipts, read state, and per-weaver aliases use independent
local storage keys and synchronize across tabs. Workflow, terminal, and desktop agent runs remain visible in
Agents but are excluded from these header notifications. Prompt text and replies
are stored with the tracked Harnesses run, not in local preferences.

## Develop

```sh
pnpm dev
pnpm quality
```

Development runs the API on port 4173 and Vite on port 5173. Open
`http://<host-lan-address>:5173`; Vite proxies API calls to the server.

`pnpm lint` runs zero-warning, type-aware Oxlint checks for TypeScript and React.
`pnpm quality` checks formatting, Oxlint, strict TypeScript, focused Vitest tests,
and the production build. The app uses React, Zustand, TanStack Query and Router,
Tailwind, shadcn/Radix components, and React Flow with Dagre layout. See
[AGENTS.md](./AGENTS.md) for the intended code structure and type discipline.

Run `pnpm setup:repo` once after cloning to activate the repository's tracked
pre-commit hook.

## Explore

The interface follows your system light/dark preference automatically, including
changes made while the page is open. Status counts, workspace filters, and live refresh
status live in the sidebar; layout, search, and filters share a compact header.
Use the fullscreen button at the top right of the content to hide the sidebar and
header. Click it again or press Escape to restore them. Your filters and layout
stay intact; the search shortcut also restores the header and focuses search.

Use Board for lanes, Outline for epic/feature context, and Graph for relationships.
The optional **In production** column appears after **In review** when matching
cards use the spool's `in_production` lane. It supports filters and saved views
and keeps production observation work visible in the all-weaver overview.
Choose a graph focus to load one card's task subtree and dependencies. Solid arrows
point from parent to child; dashed arrows point from a dependent to its prerequisite.
Scroll to zoom, drag to pan, and click a node to inspect it. Views above 150 nodes
ask you to narrow the filters or choose a smaller focus. Changing a filter or
saved view returns the graph to the filtered board.

Click any card for its description, task status, full notes, labels, and attributes.
Workspace, layout, issue/agent selection, issue detail tab, graph focus, board
filters, agent search/active-only, and selected saved view all live in the URL.
Reload, shared links, and browser Back restore that navigation state. Saved-view
links carry the filter snapshot as well as the view ID, so later saved-view edits
or deletion do not silently change what a shared link shows. Typing replaces the
current history entry rather than adding one per keystroke; discrete navigation
and filter changes create history entries. Draft forms and keyboard preferences
remain browser interaction state. Polling refreshes the board and open details
every five seconds.

Default shortcuts: `/` searches, `1`/`2`/`3` switch layouts, `r` refreshes, and `?`
opens keyboard settings. Bindings are editable and saved per browser. A blank
binding disables it; shortcuts pause in text fields and issue panels.

### Completed work

Choose **Completed** in the sidebar for a full-width **Timeline** or **Day recap**
of real done cards. Day recap defaults to yesterday; pick a date or step between
days. Search above the results and use **Filters** to narrow by epic/feature,
priority, and labels (match all or any). Both layouts share search and filters,
open issue details, and support shareable URLs.
Board’s **Include completed** still works as before.

Dates are **estimates based on last update**, not exact completion times: upstream
cards do not record a completion timestamp, and later edits can shift their day.
Abandoned and unknown outcomes are excluded. See the [completed-work guide and
screenshots](docs/completed-work.md).

### Reviews

Open **Reviews** in a weaver’s sidebar for its review inbox. The inbox contains
active reviews awaiting a local decision, including outdated revisions; **All reviews** also includes
completed and outdated revisions. Search MR, repository, commit, or reviewer
metadata and filter by execution stage. Selection and filters live in the URL.

A selected review shows the complete report, expandable reviewer results and
errors, review history, activity, and related strands. Agent runs link to their
existing inspection view when their identity is available. Decisions remain CLI
operations. Pending active reviews also offer **Prompt agent**, using the same
composer and default agent as cards. The run targets the review Strand itself;
the server adds concise repository, MR, revision, state, and artifact-location
context without copying the report or diff. Agents shows this context separately
from your prompt and offers **View review** to return to the review. The recorded
review worktree is required and must pass the same registered-worktree validation
as card launches; reviews without one cannot start an agent run.
The server reads `strand review list --all` and
`strand review show ID`; weavers without those operations show a configuration
message. Temporary refresh failures keep the last successful data visible.

Structured reviews show canonical comment candidates with **Include** and **Dismiss**
choices. **Prompt agent** on a comment retains its Strand identity, frozen review
revision, and candidate version. Agent replies are proposals: inspect/edit one and
choose **Adopt revised text** to change the canonical candidate. Merely receiving
a reply never adopts it. Original reviewer text and earlier run proposals remain
available. Curation is locked for outdated reviews or when the upstream snapshot
is no longer mutable.

Unsaved edits are saved in this browser, scoped to the weaver, review revision,
and comment. Refreshes and failed/conflicting saves retain the draft; a changed
canonical candidate requires comparison, then an explicit **Keep draft against
candidate N** action before adopting against its new version.
Only explicit cancel or acknowledgment of the matching successful adoption clears
the draft. Include/dismiss choices and adopted text are persisted upstream through
`strand review curate ID --request JSON`, using expected review/candidate versions.
`strand review comments ID` is authoritative; comments and positions are never
inferred from the Markdown report. Older reviews without structured snapshots show
an unavailable-comments message while their report stays readable.

Comment contracts and parsing live in `shared/review-comments.ts` and
`server/review-comments.ts`; the controlled UI and integration are in
`src/components/review-comment-card.tsx`, `review-comment-proposal.tsx`, and
`review-comments.tsx`. Local draft transitions and browser persistence are in
`src/lib/review-comment-draft.ts` and `src/review-comment-store.ts`.

**Send review** publishes only the included, saved candidates for the displayed
review revision and curation version. Adopt or cancel unsaved drafts first;
included comments with unsupported positions must be dismissed before sending.
Sending locks curation for that snapshot. The server invokes
`strand review publish ID --request JSON` with only the revision/version pointer;
the coordinator validates the live merge request and diff anchors and owns all
GitLab publication and deduplication.

Per-comment receipts show published discussions and comments needing reconciliation.
If a request fails or times out, some effects may already have occurred: refreshed
receipts remain authoritative, and **Retry Send review** retries the same saved
snapshot through the coordinator. It never silently clears drafts or republishes
a completed review as new work. An interrupted overall summary can still be
reconciled even if every comment already has a receipt. Sending does not complete
the local review decision or remove its worktree. Publication UI/readiness rules
are in `src/components/review-publication.tsx` and `src/lib/review-publication.ts`.
