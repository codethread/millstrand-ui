# Millstrand UI

This is an MVP for exploring real Millstrand work over a LAN. Keep it small,
readable, and easy to redesign. The issue model is read-only except for labels;
saved views are dashboard preferences. Do not add workflow mutation controls.

## Working here

- Run `strand prime kanban`, claim a feature card, and use its recorded worktree.
- Never edit `main` or push directly to `main`; feature-branch pushes are expected.
- Inspect `strand workflow show land` and `strand prime merge-queue`, then drive
  shared `land` for quality, one basic review, FIFO merge, card completion, and
  branch/worktree cleanup.

Historic Beads data remains under `.beads/` for audit only. Do not use, migrate,
delete, edit, or sync it as the operative work tracker.

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
- Run `pnpm quality` while iterating and before landing. Add focused Vitest
  tests where filtering or graph semantics merit them.
- Verify the running UI in a browser, including narrow layouts, selection,
  navigation, filters, labels, and graph interactions. A build alone is not proof
  that the dashboard works.
- Treat `.beads/` as historic audit data. Do not edit or include incidental
  changes to it.
