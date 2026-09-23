# Automatic feature delivery

This repository uses the shared Millhouse dispatcher to pick up opted-in,
graph-ready pending features. One selected worker owns each feature; no agent
polls the board to coordinate other workers. Epics and refinement cards do not
run. Existing feature dependencies still mean prerequisite code is landed.

## Repository configuration

`.millstrand/me/auto_run.clj` sets two concurrent worker slots, a 15-second
cadence, worktree preparation through `wktree`, and Sol/high as the default
worker. The default delivery workflow is `auto-human-review`. Disable new
admission by setting `:enabled? false` and refreshing workspace modules;
accepted runs remain under normal Harnesses control.

`.millstrand/me/auto_run_workflows.clj` owns three delivery workflows:

- **auto-human-review:** implement and browser-test; pass `pnpm quality`; publish
  a non-draft PR and review package; wait for CI; mechanically verify the PR
  head/checks/package; move the card into review; stop at human acceptance.
- **auto-full-land:** stay claimed through preparation and shared `land` basic review,
  then hand the existing run to a canonical-root `grunt` before sign-off. Once the
  original worker settles, the grunt drives FIFO merge, cleanup and card completion.
  Selecting this workflow is explicit authorisation to land, not just to implement.
- **auto-inspect:** perform the card-defined investigation, audit, exploratory
  review, or bounded regression check. The worker records a structured summary,
  evidence, findings, and recommended next action, then selects clean, fixed,
  needs-review, or blocked. It is evidence-first work, not a shortcut around code
  delivery.

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
 :auto-run/workflow "auto-inspect"
 :auto-run/on-change "stop"}
```

The three repo-registered delivery workflows are allowed. `auto-run/on-change`
matters only to `auto-inspect` when its result is **fixed**. Its accepted values
are `human-review`, `full-land`, and `stop`; omitted means `stop`, the
conservative default. Admission validates the value and passes it from the live
admitted card into the workflow, so a worker cannot silently choose another
changed-work policy. Plan uncertainty
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

## Inspection dispositions

Use `auto-inspect` when the useful result is evidence on the card, not necessarily
a change. The card body names the scope; the workflow requires the worker to record
one structured summary containing the conclusion, evidence, findings, and recommended
next action before it can select a disposition.

- **clean** — a shell gate verifies the exact recorded non-main branch, an empty
  `git status --porcelain` and no commits ahead of `origin/main`. Ignored artifacts
  are retained, not discarded.
  The worker records a retention receipt and returns without a PR. The workflow
  finishes its inspection, **not the card or cleanup**; the card remains claimed
  and open for a separately assigned cleanup owner.
- **fixed** — bounded worktree changes exist. Quality runs first and the admitted
  `auto-run/on-change` policy controls the ordinary path: `human-review` uses the
  existing PR/verification/review checkpoint; `full-land` uses that same path and
  the existing autonomous landing handoff; `stop` runs quality and leaves the card
  open with the exact commit and a human delivery decision still required.
  Singleton Continue checkpoints deliberately materialize these continuations
  with the freshly recorded evidence; they do not offer a new policy decision.
- **needs-review** — the workflow proves the worktree is clean, records retained
  custody, moves the card to review, and stops with the findings and recommended
  next action. It creates no code change or PR and does not remove resources.
- **blocked** — the workflow proves the worktree is clean, records retained
  custody, then stops with trustworthy blocker evidence and leaves the claimed
  card open. Use this for agent-resolvable blockage; use needs-review when a human
  decision is required. It does not claim success or manufacture a PR.

### Retained-inspection cleanup contract

All three evidence-only routes retain the worker's branch, worktree, ignored files
and other owned resources. Their required `retained` choice input records the exact
current Harnesses worker run ID, canonical root, resource inventory and handoff card
note ID. The note includes the disposition, structured evidence, workflow run ID,
branch and worktree. These are durable handoff assertions, not automated proof of
worker settlement or completed cleanup. Read the recorded choice input and note
when resuming; later `complete --context` does not re-render existing instructions.

There is intentionally no automatic inspection finisher in this repository. A
later explicitly assigned owner must work from the canonical root, read the handoff,
and verify settlement of the exact recorded worker (not merely terminal status),
including any subsequently accepted worker that still holds these resources. If
custody or outcome is uncertain, retain everything and request reconciliation.
A shell `cd` by the original worker does not release its persistent cwd.

That later cleanup must preserve the existing deletion preconditions:

1. Verify the exact recorded branch is checked out and is not `main`.
2. Require a clean tracked/untracked tree and no commits ahead of `origin/main`.
3. Only known disposable artifacts may be discarded: `node_modules`, `dist`,
   `coverage`, `*.tsbuildinfo` and `.DS_Store`. Require an empty
   `git status --porcelain --ignored --untracked-files=all` afterward. Unknown
   ignored files, including `.env`, prevent removal; record and retain them.
4. Remove the exact worktree and delete the branch only after those checks. Record
   actual cleanup evidence, not merely the earlier clean inspection result.
5. Only an accepted **clean** disposition may finish without a PR. After cleanup,
   reserve the still-claimed card through `millstrand-ui.auto-run/mark-clean-finishing!`
   before the shared `finish-card!` action. The reservation and lane-race protection
   remain in force; a review transition must leave the card open. Needs-review and
   blocked outcomes never authorize card completion.

Do not reserve clean completion during retention: that would freeze a card whose
cleanup has not happened and prevent a legitimate later review decision. No live
or previously poured workflow is rewritten by these source changes.

## Autonomous landing handoff

This is delivery policy, not a dispatcher teardown feature. Shared `land` stays
unchanged. Its sign-off starts an executor-owned chain that includes worktree
removal, so the handoff must happen **before approval**, not just before cleanup.
A per-command shell `cd` does not move the original agent session's persistent
cwd.

`auto-full-land` calls Millhouse's optional `auto-run-land/autonomous-land` composition. It
pours two distinct delivery targets under the feature run:

1. the active `handoff-worker` step, which the assigned worker serves; and
2. the dependent, initially blocked `finisher` step, which the canonical-root
   `grunt` serves after the worker successfully settles.

The worker drives `land-auto-CARD` through PR resolution and mandatory review,
adjudicates findings, and stops at sign-off. Before launching a finisher, it
locates both role-tagged steps in the delivery graph and verifies that its own
agent target is the worker step, never the finisher step. A previous combined
single-step run without a separate finisher target requires explicit recovery;
the worker must not invent or replace a target.

The worker records the exact PR/head, review disposition, land and delivery run
IDs, **both** handoff step IDs, original worker run ID, canonical root,
branch/worktree, and owned resource inventory on the card. It records
`auto-run/worker-run-id` on the finisher step before launch.

It then uses headless `strand agent run grunt` in the canonical root, with
explicit `--workspace` and its own `--by-identity`. The launch uses:

- `--target FINISHER_STEP_ID`, never the handoff-worker step or card;
- `--request-id auto-land-finisher/FINISHER_STEP_ID`; and
- the complete rendered finisher instruction as one `--prompt` argument.

Acceptance of the blocked finisher target is intentional: it cannot launch
until the worker step closes. An uncertain response is inspected with
`agent show --request` using the same key, rather than a fresh launch key. The
accepted run ID is recorded as `auto-run/finisher-run-id` on the finisher step
and in the card handoff note. Only after both receipts are recorded does the
worker complete the **handoff-worker** step and return; it never completes the
finisher step or waits for the grunt.

The grunt awaits `agent-run-settled` for the recorded worker run, with
`--min-count 1`. A terminal status alone is insufficient. Before sign-off it
requires successful settlement, the matching worker/finisher receipts, no
agent blocker, and the matching land run at sign-off. It then drives the existing
land run through FIFO merge, cleanup, and the land-owned card completion gate.
Only after the card is closed does it complete the **finisher** step.

### Failure policy

For `auto-full-land`, leave failed delivery open with its resources and merge
reservation retained. Do not clear a failed gate, spawn a replacement, retry
landing or withdraw the queue entry without explicit recovery authorization.
This overrides shared land's repair advice. An uncertain merge needs reconciliation.

A recovery worker may serve the card or handoff-worker step, never the finisher
step; a finisher recovery serves only its existing finisher target and never
launches another finisher. An accepted blocked finisher is retained rather than
replaced. The disposable workspace test mechanically verifies that the role-tagged
worker and finisher steps have distinct IDs and that the finisher is dependent on
the worker.

Failure to complete outer delivery bookkeeping never reopens or re-merges landed work.

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

- Automatic quality gates invoke `sh .millstrand/land-quality.sh`, the existing
  suite-lock owner, exactly once. It runs `git diff --check` and
  `flock -w 180 /tmp/millstrand-test.lock pnpm quality`. Do not wrap that script in
  another lock. `pnpm quality` includes PR-boundary tests and TypeScript checking.
  Lock timeout is a visible gate failure, not passing quality evidence.
- `make -C .millstrand quality` runs Clojure lint and the workspace tests; CI
  runs this as the separate `workspace` check. From `.millstrand`,
  `clojure -M:test` boots the actual init/modules in disposable
  in-memory Weaver worlds. It verifies activation, defaults, ordinary worker
  entry steps, executor gates, and the human versus autonomous exit boundaries.
  It creates no opted-in cards and launches no paid agents. Inspection tests drive
  actual ready boundaries, reject missing evidence/retention input, execute the
  rendered clean gate against disposable Git trees, and verify that workflow
  completion retains files and leaves cards open. They check reservation/lane
  protection and human versus autonomous routing, not guaranteed agent compliance,
  a live worker settlement, or a live merge.
- Updating the Codethread dependency pin requires the supported Weaver restart,
  with explicit user approval. Source-only module edits use normal refresh.
  Never bypass the dependency-basis check with runtime or classloader mutation.
- This handoff is a source-only delivery-policy change. Normal module refresh
  updates new workflow runs, not instructions already poured into existing runs.
  Do not restart, relabel, or rearm existing assignments to apply it retroactively.
