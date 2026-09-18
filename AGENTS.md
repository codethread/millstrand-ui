# Millstrand UI

This is an MVP for exploring real Millstrand work over a LAN. Keep it small,
readable, and easy to redesign. Most of the design is read-only but some
areas allow targeted edits.

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
- Import concrete domain options from `src/lib/api/`, workspace query composition
  from `src/hooks/use-*`, and Router selectors/actions from `src/lib/navigation.ts`;
  no catch-all API barrel. The checked [module map and data
  contract](docs/architecture.md) lists every key, endpoint and mutation settlement.
- Declare a poll owner before adding cache readers. Discovery is owned by
  `workspace-discovery.tsx`; selected-workspace board/agent/review/view freshness is
  owned by `workspace-resource-polls.tsx` across every workspace mode. Readers share
  those keys with `enabled: false` and `refetchInterval: false`; health/error consumers
  remain explicit. Do not call the exported `use*Poll` hooks anywhere else.
- Select nested Query content and relevant Zustand values/actions, not whole
  snapshots/stores. Shell readers use the concrete projection hooks in `src/hooks`;
  status readers separately select `fetchedAt` and Query health. Pure projections
  live in existing domain files under `src/lib`. Keep shared leaves such as
  `src/components/markdown.tsx` independent of pages.
- Mutation options own workspace-scoped cache effects; hooks own Router reactions.
  Preserve awaited settlement versus background invalidation (see
  `src/lib/api/cards.ts` and `src/hooks/use-cards.ts`). Keep the single QueryClient
  setup in `src/lib/api/query-client.ts`; do not mirror its cache in another store.

## Product and verification

- Use real workspace data. Show loading, empty, and disconnected states clearly;
  retain the last successful board during a temporary refresh failure.
- Keep labels and view edits explicit and show failures in the relevant form.
- Serve SPA and API from the same LAN address. Do not make browser-side calls to
  localhost or expose arbitrary command execution through the API.
- Keep keyboard shortcuts configurable and inactive while typing in inputs.
- Run `pnpm quality` while iterating and before landing, including its zero-warning
  type-aware Oxlint gate. Add focused Vitest
  tests where filtering or graph semantics merit them.
- Verify the running UI in a browser, including narrow layouts, selection,
  navigation, filters, labels, and graph interactions. A build alone is not proof
  that the dashboard works.

## Millstrand / strand

This repo uses Millstrand strands to track work. Start with `strand --help`. Run `mill prime millstrand` when building on this repo's `.millstrand/` config, or working with millstrand spools, weaver or REPL.

Target other repos with direct `--workspace` flag:

```bash
strand --workspace ~/dev/projects/harnesses.spool/.millstrand help
```

### Upstream model references

When a machine does not have the local Strand or spool sources available, use
these GitHub entry points to understand the upstream data and operations:

- [Millstrand core](https://github.com/codethread/millstrand/blob/main/README.md)
- [Millhouse Kanban spool](https://github.com/codethread/millhouse.spool/blob/main/spools/kanban/README.md)
- [Millhouse Workflow spool](https://github.com/codethread/millhouse.spool/blob/main/spools/workflow/README.md)
- [Harnesses spool](https://github.com/codethread/harnesses.spool/blob/main/README.md)

These links track each repository's `main` branch and are discovery entry
points. A specific workspace's behavior is defined by the direct pins in
`.millstrand/deps.edn` and any transitive configuration dependencies.

## Automatic assignments

For an auto-run assignment, drive the exact delivery workflow run supplied in
its guidance; see [automatic delivery](docs/auto-run.md). `auto-human-review`
explicitly overrides generic instructions to land: prepare the passing PR and
review package, stop at its human checkpoint, and leave the feature/worktree
open. Never choose that checkpoint yourself. `auto-full-land` authorises shared
`land`, but the assigned worker stops **before sign-off** and launches the bounded
canonical-root `grunt` described in the delivery step. That finisher waits for the
worker to settle, then owns merge, cleanup and final card completion. Do not remove
your own session's worktree, close the card early, spawn a coordinator, or keep a
session alive polling for human approval. On an observed autonomous delivery or
handoff failure, add `auto-run-failure`, record evidence, and stop for manual
intervention without retrying gates or withdrawing the merge reservation.

## Working here

- Run `strand prime kanban`, claim a feature card, and use its recorded worktree.
- Never edit `main` or push directly to `main`; feature-branch pushes are expected.
- Inspect `strand workflow show land` and `strand prime merge-queue`, then drive
  shared `land` for quality, one basic review, FIFO merge, card completion, and
  branch/worktree cleanup.
