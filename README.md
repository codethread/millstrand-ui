# Millstrand UI

A web interface for exploring Millstrand workspaces. Its first surface covers
Kanban cards, tasks, dependencies, and activity through a local Node server.
Only card labels and saved dashboard views are currently editable.

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
reach the server can browse discovered local weavers and edit their card labels
and saved views. Bind to
localhost when using a tunnel or when the network is not trusted.

## All-weaver overview

The home page (`/?mode=overview`) shows work in motion across every discovered
local weaver: only in-progress/review cards and active agents (running, queued,
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
numbers, and hyphens. Issue state, title, body, ownership, and graph links are
read-only in this app.

Custom views persist on the **server**, shared by browsers viewing the same
workspace. They live in
`${XDG_CACHE_HOME:-$HOME/.cache}/millstrand/millstrand-ui/views.json`, keyed by the
absolute `.millstrand` path. Web views are separate from the terminal
dashboard's saved views. Included labels combine with ALL or ANY matching;
excluded labels always remove a match. Views can also narrow the board using
search, status, issue type, and priority.

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
even when a workspace does not publish Kanban. Inspection uses a bounded core
strand list (up to 10,000 strands) and exposes only selected metadata—not provider
environment variables, injected prompts, or credentials.

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
`http://<host-lan-address>:5173`; Vite proxies API calls to the server. The check
commands run strict TypeScript, focused Vitest tests, and the production build.

`pnpm quality` checks formatting, strict TypeScript, focused Vitest tests, and
the production build. The app uses React, Zustand, TanStack Query and Router,
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

### Reviews

Open **Reviews** in a weaver’s sidebar for its review inbox. The inbox contains
current, active reviews awaiting a local decision; **All reviews** also includes
completed and outdated revisions. Search MR, repository, commit, or reviewer
metadata and filter by execution stage. Selection and filters live in the URL.

A selected review shows the complete report, expandable reviewer results and
errors, review history, activity, and related strands. Agent runs link to their
existing inspection view when their identity is available. Decisions remain CLI
operations. The server reads `strand review list --all true` and
`strand review show ID`; weavers without those operations show a configuration
message. Temporary refresh failures keep the last successful data visible.
