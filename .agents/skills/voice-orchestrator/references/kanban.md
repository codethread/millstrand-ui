# Kanban planning

Examples use Nushell variables bound from confirmed live data: `$ws` is the
absolute owning `.millstrand` path, `$actor` the provided identity, and IDs come
from command results. Do not copy sample identities or guess flags.

```nu
mill weaver list
strand --workspace $ws prime kanban
strand --workspace $ws kanban board
strand --workspace $ws kanban card $card
strand --workspace $ws pattern explain kanban-batch
strand --workspace $ws query list
```

Walk epic → features; inspect each relevant card's notes, tasks and dependency
edges before explaining readiness. Use `query explain` for registered readiness
queries. `kanban board --all true` includes compact all-state cards and direct
epic membership; labels are repeatable AND filters.

Make each direct user request a feature with outcome, non-goals, acceptance,
verification and delivery boundary. Use an epic only for useful grouping. Put
uncertain ideas in refinement, not executable pending work. Create tasks before
execution; feature dependencies mean prerequisite code is landed, not merely
that a worker returned. Avoid cycles and cross-board ID assumptions.

```nu
strand --workspace $ws kanban add 'Outcome title' --type feature --lane refinement --body $body
strand --workspace $ws kanban add 'Child outcome' --epic $epic --lane refinement --body $body
strand --workspace $ws add 'Verify the outcome' --attr $'body=($verification)'
# Capture the returned task ID, then parent -> child:
strand --workspace $ws update $card --edge $'parent-of:($task)'
# Dependent -> prerequisite, not the reverse:
strand --workspace $ws update $dependent --edge $'depends-on:($prerequisite)'
strand --workspace $ws note $card $decision --by $actor
strand --workspace $ws update $card --attr kanban/lane=pending
```

For atomic multi-card creation, inspect `pattern explain kanban-batch` and
`help weave`; use its current input contract rather than inventing a batch schema.

Workers claim themselves with `kanban claim CARD --owner ACTOR --branch BRANCH
--worktree PATH --run-id RUN`. Claim uses **--owner**, not --by-identity. Never
preclaim for a delegated worker. Use `update TASK --state closed` as each task
finishes: feature finish marks remaining tasks unactioned, not completed.

Lane patches use `update CARD --attr kanban/lane=LANE`: pending for promotion,
in_review for review, claimed for rework, in_production only for remaining
post-merge observation. They are not guarded workflow transitions. Preserve
structured `kanban claim`, `finish`, and `reopen`; inspect their help before use.
Do not close a feature early to release dependents.

Attribution is command-specific: `note --by`; claim `--owner`; agent commands
`--by-identity`; workflow transitions `--by`. `kanban add`, label operations,
`add`, and `update` have no universal attribution flag. Record an attributed note
when provenance matters; never append unsupported flags.
