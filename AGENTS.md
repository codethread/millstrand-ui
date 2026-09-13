# Millstrand UI

This is an MVP for exploring real Millstrand work over a LAN. Keep it small,
readable, and easy to redesign. The issue model is read-only except for labels;
saved views are dashboard preferences. Do not add workflow mutation controls.

## Types and boundaries

- Use strict TypeScript, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Do not weaken compiler settings to fix errors.
- Prefer small, concrete named domain types. Use discriminated unions for states
  that carry different data; avoid bags of optional fields and boolean flags.
  For example, use `{ kind: 'closed' } | { kind: 'editing'; draft: View }`.
- Use `null` for an explicitly absent value. Reserve optional properties for
  genuinely optional boundary fields. Model required values as required.
- Parse CLI, HTTP, and persisted data once at the boundary. Use `unknown` for
  untrusted data, never `any`. Do not scatter type assertions or defensive checks
  through components. Preserve unknown issue attributes as JSON values.
- Prefer ordinary functions and explicit props over generic frameworks,
  inheritance, clever mapped types, or abstractions with only one use.

## Ownership of logic

- TanStack Query owns server state, polling, invalidation, and mutation feedback.
- Zustand owns interaction state, drafts, keyboard preferences, and actions.
- TanStack Router owns shareable navigation, including the selected issue.
- Put filtering, hierarchy, graph transforms, and other domain rules in pure
  functions under `src/lib`. Components render data and delegate actions.
- Keep styles in Tailwind and the shared theme; use the shadcn/Radix primitives
  under `src/components/ui` for accessible controls and overlays.

## Product and verification

- Use real workspace data. Show loading, empty, and disconnected states clearly;
  retain the last successful board during a temporary refresh failure.
- Keep labels and view edits explicit and show failures in the relevant form.
- Serve SPA and API from the same LAN address. Do not make browser-side calls to
  localhost or expose arbitrary command execution through the API.
- Keep keyboard shortcuts configurable and inactive while typing in inputs.
- Run `pnpm quality` before completing changes. Add focused Vitest tests where
  filtering or graph semantics merit them.
- Verify the running UI in a browser, including narrow layouts, selection,
  navigation, filters, labels, and graph interactions. A build alone is not proof
  that the dashboard works.
- `.beads/issues.jsonl` is generated and included in normal commits by the
  pre-commit hook; ignore incidental diffs and do not edit it manually.

<!-- br-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`/`bd`) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View ready issues (open, unblocked, not deferred)
br ready              # or: bd ready

# List and search
br list --status=open # All open issues
br show <id>          # Full issue details with dependencies
br search "keyword"   # Full-text search

# Create and update
br create --title="..." --description="..." --type=task --priority=2
br update <id> --status=in_progress
br close <id> --reason="Completed"
br close <id1> <id2>  # Close multiple issues at once

# Sync with git
br sync --flush-only  # Export DB to JSONL
br sync --status      # Check sync status
```

### Workflow Pattern

1. **Start**: Run `br ready` to find actionable work
2. **Claim**: Use `br update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `br close <id>`
5. **Sync**: Always run `br sync --flush-only` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready` shows only open, unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers 0-4, not words)
- **Types**: task, bug, feature, epic, chore, docs, question
- **Blocking**: `br dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
br sync --flush-only    # Export beads changes to JSONL
git commit -m "..."     # Commit everything
git push                # Push to remote
```

### Best Practices

- Check `br ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `br create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always sync before ending session

<!-- end-br-agent-instructions -->
