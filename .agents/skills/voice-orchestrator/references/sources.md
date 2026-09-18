# Source and workspace map

This is a **machine-local discovery map**, not universal paths or permission to
operate. Reconfirm directories and `mill weaver list` on each host. The owning
workspace's `.millstrand/deps.edn` and transitive pins determine active code;
sibling main can differ. Read owner AGENTS.md and relevant README before sources.
Use live help's source provenance to locate the installed implementation.

| Owner         | Local checkout                          | Workspace candidate                                 | Investigate here                                                  |
| ------------- | --------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Millstrand    | /Users/ct/dev/projects/skein-src        | /Users/ct/dev/projects/skein-src/.millstrand        | CLI, Weaver, storage, activation; docs/reference.md               |
| Millhouse     | /Users/ct/dev/projects/millhouse.spool  | /Users/ct/dev/projects/millhouse.spool/.millstrand  | Kanban, identity, workflow, land, merge queue; spools/*/README.md |
| Harnesses     | /Users/ct/dev/projects/harnesses.spool  | /Users/ct/dev/projects/harnesses.spool/.millstrand  | Agents, seats, assignments, run lifecycle, providers; README.md   |
| Codethread    | /Users/ct/dev/projects/codethread.spool | /Users/ct/dev/projects/codethread.spool/.millstrand | Shared config and auto-run dispatcher                             |
| wktree        | /Users/ct/dev/projects/wktree           | None confirmed                                      | Worktree CLI; README.md and wktree -h                             |
| Millstrand UI | /Users/ct/dev/projects/millstrand-ui    | /Users/ct/dev/projects/millstrand-ui/.millstrand    | Dashboard and repository delivery policy; docs/auto-run.md        |

Harnesses is the current sole agent-operation owner. Do not route investigations
to an obsolete agent spool. If a checkout is missing, use the upstream links in
repository AGENTS.md for discovery, then resolve the active pin before relying on
behavior. Do not create a workspace just because a checkout exists.

Keep running in the hub cwd while targeting the owning board explicitly:

```nu
strand --workspace /Users/ct/dev/projects/millhouse.spool/.millstrand prime kanban
strand --workspace /Users/ct/dev/projects/millhouse.spool/.millstrand kanban board
strand --workspace /Users/ct/dev/projects/millhouse.spool/.millstrand kanban card $card
# Only after confirming that this repository owns the requested work:
strand --workspace /Users/ct/dev/projects/millhouse.spool/.millstrand kanban add $title --lane refinement --body $body
```
