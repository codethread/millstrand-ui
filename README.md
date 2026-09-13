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
Issue selection and layout live in the URL, so links can be shared and browser
Back works. Polling refreshes the board and open details every five seconds.

Default shortcuts: `/` searches, `1`/`2`/`3` switch layouts, `r` refreshes, and `?`
opens keyboard settings. Bindings are editable and saved per browser. A blank
binding disables it; shortcuts pause in text fields and issue panels.
