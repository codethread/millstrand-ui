# Automatic feature delivery

This repository uses the shared Codethread dispatcher to pick up opted-in,
graph-ready pending features. One selected worker owns each feature; no agent
polls the board to coordinate other workers. Epics and refinement cards do not
run. Existing feature dependencies still mean prerequisite code is landed.

## Repository configuration

`.millstrand/me/auto_run.clj` sets two concurrent worker slots, a 15-second
cadence, worktree preparation through `wktree`, and Sol/high as the default
worker. The default delivery workflow is `auto-human-review`. Disable new
admission by setting `:enabled? false` and refreshing workspace modules;
accepted runs remain under normal Harnesses control.

`.millstrand/me/auto_run_workflows.clj` owns both delivery workflows:

- **auto-human-review:** implement and browser-test; pass `pnpm quality`; publish
  a non-draft PR and review package; wait for CI; mechanically verify the PR
  head/checks/package; move the card into review; stop at human acceptance.
- **auto-full-land:** perform the same preparation, then drive shared `land`,
  including basic review, FIFO merge, card completion, and cleanup. Selecting
  this workflow is explicit authorisation to land, not just to implement.

The worker drives the exact workflow run created by the dispatcher. Ordinary
steps contain maintainer-authored instructions; shell/code gates enforce
mechanical transitions. A human checkpoint tells the worker to return, not to
wait in a running session or choose approval itself. This is a trusted-agent
workflow contract, not a security boundary against arbitrary CLI mutations.

## Opt in a card

Add the `auto-run` label and promote a planned feature to pending. Optional
attributes override repository defaults:

```clojure
{:auto-run/seat "astra"
 :auto-run/effort "low"
 :auto-run/workflow "auto-human-review"}
```

Only the two repo-registered delivery workflows are allowed. Plan uncertainty
into small cards and dependencies: a UI-direction card can stop for human
acceptance before dependent implementation becomes eligible.

Board cards and details display the auto-run configuration separately from
actual worker activity. `auto-run/status=assigned` is a durable dispatch receipt,
not a claim that the agent is still running. The normal Agents surface owns that
lifecycle view. Inspect receipts with `strand auto-run status` and the exact
run with `strand agent show RUN_ID`.

Admission starts when the receipt says `preparing`. Removing a label or moving
a card is not cancellation of admitted work. Disable admission and inspect/stop
the exact Harnesses run when withdrawing work. Failures remain visible and are
not automatically retried; an operator can explicitly continue a settled worker
against the retained card, worktree and delivery workflow.

## Human review handoff

The PR must have the exact local committed HEAD, target main, be open and
non-draft, and have passing checks including the GitHub `quality` job. Its body
must include nonempty `Summary`, `Walkthrough`, `Verification`, and `Screenshots`
level-two sections. The walkthrough includes a Mermaid diagram at an appropriate
C4 level. Screenshots must be accessible for visible changes, or the section must
explain why none apply. Automation checks the package structure; the human judges
its accuracy and usefulness.

The worker posts the PR URL and concise handoff on the card, with detailed browser
and test evidence on its verification task. It then returns without merging,
closing the feature, approving the checkpoint, or deleting the worktree. Human
feedback and eventual landing use explicit continuation/the normal land process;
there is no automatic approval-by-label or lane-triggered rerun in v1.

## Verification and deployment

- `pnpm quality` includes focused PR-boundary tests and TypeScript checking for
  the verification script.
- `make -C .millstrand quality` runs Clojure lint and the workspace tests; CI
  runs this as the separate `workspace` check. From `.millstrand`,
  `clojure -M:test` boots the actual init/modules in disposable
  in-memory Weaver worlds. It verifies activation, defaults, ordinary worker
  entry steps, executor gates, and the human versus autonomous exit boundaries.
  It creates no opted-in cards and launches no paid agents.
- Updating the Codethread dependency pin requires the supported Weaver restart,
  with explicit user approval. Source-only module edits use normal refresh.
  Never bypass the dependency-basis check with runtime or classloader mutation.
