# Automatic feature delivery

This repository uses the shared Millhouse dispatcher to pick up opted-in,
graph-ready pending features. One selected worker owns each feature; no agent
polls the board to coordinate other workers. Epics and refinement cards do not
run. Existing feature dependencies still mean prerequisite code is landed.

## Repository configuration

`.millstrand/me/auto_run.clj` sets two concurrent worker slots, a 15-second
cadence, worktree preparation through `wktree`, and Sol/high as the default
worker. The default delivery workflow is `auto-human-review`. Before enabling,
the small shared guard in `.millstrand/me/admission_authority.clj` derives the
canonical checkout from Git's absolute common directory. Only the Weaver rooted at
that checkout's `.millstrand` enables admission; a linked-worktree Weaver disables
itself even when its branch is `main`.
Non-Git or unsupported workspace layouts also disable admission explicitly. The
resource result reports the inspected checkout authority, while `auto-run status`
reports whether dispatch is enabled. Disable new admission by setting `:enabled?`
false and refreshing workspace modules; accepted runs remain under normal Harnesses
control.

`.millstrand/me/auto_run_workflows.clj` owns three delivery workflows:

- **auto-human-review:** implement and browser-test; pass `pnpm quality`; publish
  a non-draft PR and review package; wait for CI; mechanically verify the PR
  head/checks/package; move the card into review; stop at human acceptance.
- **auto-full-land:** stay claimed through preparation and the repository's `land`
  basic review, then hand the existing run to a canonical-root `grunt` before sign-off. Once the
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

## Hourly SLOW-query inspection

`.millstrand/me/hourly_slow_query.clj` is a tracked Cron module, activated by
`init.clj` with the pinned `millhouse/cron` dependency in `deps.edn`. Each hourly
wake offers a Sol/high `auto-inspect` feature with `auto-run/on-change=full-land`.
The job only creates cards: Auto-run owns capacity, preparation, workflow creation
and assignment; the worker claims with its own identity. Scheduled cards have no
fabricated creator, reporter or owner.

The hourly handler independently checks the same Git common-root authority before
reading or mutating its Weaver. A linked-worktree or unsupported Weaver returns
`not-authoritative` with its inspected checkout paths and cannot create a card, even
when its private database is empty.

The complete policy, opt-in label, `maintenance/job=hourly-slow-query`, and
UTC-hour source receipt are published in one mutation. Duplicate delivery of that
hour reuses its card even if it was edited, failed or closed; it never rearms it.
Before creating a new hour, the same admission lock queries every active card with
that exact job attribute. Any prior open card suppresses admission regardless of
lane, blocker, retained custody or dispatcher capacity; the result reports the
open card IDs. Closed cards from earlier hours do not suppress later work. Cron is
a fixed interval from activation, not a wall-clock top-of-hour schedule, and does
not backfill missed hours.

A clean result needs no PR and hands its resources to the independent canonical-root
clean finisher below. A fix follows the existing full-land continuation and landing
finisher. Inspect existing hourly findings before selecting work to avoid duplicating
a fix.
To disable new hourly cards, remove the job module declaration and refresh;
removing it does not cancel cards or assignments already created.

When upgrading the former machine-local job, remove its duplicate Cron/job
registrations from `init.local.clj` and its redundant `millhouse/cron` entry from
`deps.local.edn`, then remove `me/hourly_slow_query.local.clj`. Preserve unrelated
local settings. Inspect refresh's result; if the dependency basis changed, use the
supported restart with approval. Existing cards and workflow runs are not rewritten.

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
  `git status --porcelain` and no commits ahead of `origin/main`. The worker records
  a retention receipt, freezes one immutable canonical-root finisher request, launches
  that separate target with an idempotent request ID, releases its own custody and
  returns without a PR. After exact worker settlement, the finisher uses the supported
  cleanup operation below; only successful cleanup closes the card.
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

Every evidence-only route first retains the worker's branch, worktree, ignored files
and other owned resources. Its required `retained` choice input records the exact
current Harnesses worker run ID, canonical root, branch, worktree, full HEAD, resource
inventory and handoff card note ID. The note includes the disposition, structured
evidence and workflow run ID. These are durable handoff assertions, not proof of
worker settlement or cleanup. Read the recorded choice input and note when resuming;
later `complete --context` does not re-render existing instructions.

New clean runs then use a persistent `clean-finisher` target. The worker freezes an
exact `agent assign grunt` request: canonical cwd, task target,
`stop-on-complete` policy, request ID and worker run receipt. Assignment freezes the
target instruction and policy in `harness/context`; the worker records the accepted
finisher run before releasing. The finisher waits for successful settlement of the
exact worker. Other managed runs
whose cwd is within the retained worktree need positive terminal settlement, but do
not need successful execution. External/native observations are not managed process
settlement: never rewrite them to look settled. They require explicit reconciliation
plus a clean live local process and Weaver audit. Needs-review and blocked retain
resources and open cards without launching this finisher.

The finisher invokes the canonical-Weaver `clean-inspection-finish` operation. The
same operation is the supported completion surface for already-retained clean runs:
a separately assigned canonical-root owner supplies the closed clean disposition
step, retained step, exact worker and original finisher run IDs, branch, worktree,
retained full expected HEAD, canonical root, handoff note, actor, and a stable
request ID. Read its live help before use. The operation resolves both checkpoint
roots and requires their workflow run and card/branch/worktree contexts to match the
card's actual auto-run delivery. It verifies all durable evidence and accepted
canonical custody, freezes the original request, executes
`.millstrand/clean-inspection-cleanup.sh`, then records the cleanup receipt. An older
clean inspection does not need a fabricated step added to its closed workflow. Create
a real task parented to the card whose body names the supported finish operation and
exact evidence. Tag it as the `clean-finisher` target with the card and worker
receipts, then accept its owner with `agent assign`. Record that accepted run as the
original finisher receipt; do not synthesize a workflow step or rewrite old evidence.

A positively settled failed assigned finisher may transfer custody through either
supported accepted continuation: native `resume`, or a fresh `agent assign --after` when its
native session is unusable. Both preserve the target, logical lineage and canonical
cwd. The original finisher, initiating actor, and request remain immutable; the
cleanup receipt separately names the continuation that performed completion. Exact
replay remains harmless after interrupted cleanup and after a successfully completed
continuation. Frozen requests from before checkpoint root IDs were recorded replay
against their original fields and are not rewritten. A
first request with both branch and worktree already absent is refused rather than
treated as successful cleanup. A legacy retained receipt missing the
branch/worktree/HEAD fields, or stale external cwd observations after a clean local
audit, requires explicit `--reconciliation`
evidence. These are bounded existing-run paths, not inferred backfill. Do not use the
operation for needs-review or blocked outcomes, and do not mutate the database or
call implementation functions from a REPL to imitate completion.

Cleanup preserves these deletion preconditions:

1. Verify the exact recorded branch is checked out and is not `main`.
2. Require a clean tracked/untracked tree and no commits ahead of `origin/main`.
3. Inspect host processes with cwd inside the worktree and every live Weaver under
   it. Any live holder prevents deletion. A stale external/native row such as a
   departed child session is recorded as an observation, never fabricated into
   managed settlement.
4. Only known disposable artifacts may be discarded: `node_modules`, `dist`,
   `coverage`, `*.tsbuildinfo` and `.DS_Store`. Validate compact ignored entries,
   then remove the allowlisted set with one `git clean -fdX`; do not enumerate and
   remove every file. Unknown ignored files, including `.env`, prevent removal.
5. Inspect the exact branch/path through `wktree list --json`, then use
   `wktree remove --branch ... --json` for worktree lifecycle. Record its exact
   successful result, not merely the earlier clean inspection result.
6. Only an accepted **clean** disposition may finish without a PR. After cleanup,
   the operation reserves the still-claimed card through
   `millstrand-ui.auto-run/mark-clean-finishing!`, then calls the shared
   `finish-card!` action. Its immutable in-flight request also prevents a lane race
   once cleanup starts. Needs-review and blocked never authorize card completion.

Do not reserve clean completion during initial retention. Source refresh changes new
pours only. Already-poured clean runs keep their original evidence and use the
supported operation under explicit ownership; already-poured blocked/needs-review
runs remain open. Missing or contradictory receipts require manual reconciliation,
not fabricated attributes, a replacement run or forced workflow closure.

## Landing workspace

Run Land, its review, merge queue and signoff in the **canonical checkout's
`.millstrand` workspace**, alongside the card and automatic delivery run. Resolve
that checkout with `wktree root` and pass its workspace explicitly to `strand`.
The `worktree` workflow parameter remains the feature directory: shell checks,
review and Git operations use it, but it is not the workflow's database.
Repository Land rejects a start in a different Weaver before publishing a run.
Its rendered queue/signoff commands continue to target the canonical workspace,
which survives feature-worktree cleanup and owns one FIFO for the repository.

Previously the local instructions incorrectly directed landing to a worktree
Weaver. This created a separate database without the canonical card and failed
at the first card gate. Source refresh fixes **new** runs only. Existing failures
must retain their exact run, attempt, PR and ownership evidence for explicitly
assigned recovery; do not duplicate the card, force a gate closed, rearm the
assignment or silently replace its run.

The narrow `land-abort-misplaced` operation exists only for those historical
foreign-Weaver roots. A separately assigned recovery owner runs it in that same
foreign workspace with the exact run, pre-signoff root, failed reviewer gate,
settled failed reviewer run, actor and authorized reason. It refuses canonical,
progressed or uncertain roots, active shell custody, a visible local card, and
changed reviewer evidence. On positive retirement it preserves the reviewer
failure and routes the old root into `land-abort` without touching the canonical
card. Unknown retirement leaves the root frozen for reconciliation. This is not
a review bypass or a way to migrate, approve or merge an old run; use it only
after the tracked operation is deployed and registered, never by direct database
or REPL mutation.

## Autonomous landing handoff

This is delivery policy, not a dispatcher teardown feature. The repository-owned
`land` remains independent of dispatcher lifecycle. Its sign-off starts an executor-owned chain that includes worktree
removal, so the handoff must happen **before approval**, not just before cleanup.
A per-command shell `cd` does not move the original agent session's persistent
cwd.

`auto-full-land` calls Millhouse's pinned `auto-run-land/autonomous-land`
composition. The assigned worker normally serves the card, not a manufactured
worker target, and advances four recorded worker phases: review, prepare, accept,
and release. The delivery graph also contains one persistent `finisher` custody
target, three finisher phases, and an executor verification gate. The finisher
target is blocked on worker release; its first phase separately proves worker
settlement.

The worker drives `land-auto-CARD` through PR resolution and mandatory review,
adjudicates findings, and stops at sign-off. It locates the unique role-tagged
finisher target and verifies that its own agent target is the card or a worker
phase, never that finisher. Card `auto-run/run-id` must name the current worker.
A stale receipt stops before launch and requires scoped `auto-run register-worker`
reconciliation; old poured workflows are not migrated.

The handoff records the PR/head, review disposition, land and delivery run IDs,
worker release step, finisher target, current worker run, canonical root,
branch/worktree and owned resources. On the finisher target it freezes
`auto-run/worker-run-id`, `auto-run/canonical-root`, and the complete immutable
`auto-run/finisher-request` before launch.

The worker launches headless `strand agent run grunt` with its own identity,
`--cwd CANONICAL_ROOT`, `--target FINISHER_TARGET_ID`, request ID
`auto-land-finisher/FINISHER_TARGET_ID`, and the stored complete prompt. The
workspace still remains the explicitly selected canonical Weaver for surrounding
Strand commands; `--cwd` is the agent's process root. An uncertain response is
looked up with `agent show --request` using the same key and must match exact target,
cwd and prompt. The accepted run becomes `auto-run/finisher-run-id` on the target
and in the card note. Only after both receipts and the request read back does the
worker release and return; it never waits for or acts as the finisher.

The grunt awaits `agent-run-settled` for the recorded worker run, with
`--min-count 1`. A terminal status alone is insufficient. Before sign-off it
requires successful settlement, the matching worker/finisher receipts, no
agent blocker, and the matching land run at sign-off. It then drives the existing
land run through FIFO merge, cleanup, and the land-owned card completion gate.
Only after the card is closed does it complete the **finisher** step.

### Failure policy

For `auto-full-land`, the independent finisher owns scoped rebase conflicts and
defects caused by the candidate. It records and repairs them, obtains focused review
for material changes, pushes, and retries the **same** settled failed gate under the
pinned workflow retry rules; no replacement worker or new approval is needed. Keep
the FIFO reservation. Managed Code gates use `workflow retry` with the exact attempt
and a fresh request key; never clear their `gate/error` manually.

Escalate for uncertain subprocess/merge settlement, mismatched identities or
receipts, unknown resource ownership, out-of-scope failure, or an exhausted retry
budget. Retain the exact run and resources; never replace the accepted finisher.
A recovery worker serves the card or worker phase, while finisher recovery serves
only the existing persistent finisher target. Crashes between acceptance and receipt
storage, or during worker release, reconcile the same immutable request and current
worker lineage. Previously poured runs retain their own graph and evidence; use
scoped reconciliation rather than pretending the current source was present.

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
  The hourly admission test disables dispatch before creating opted-in fixture
  cards; it covers per-hour replay plus open-job suppression across board states.
  The suite launches no paid agents. Inspection tests drive actual ready boundaries,
  reject missing evidence/retention input, execute clean gates against disposable
  Git trees, and verify separate worker/finisher topology. The cleanup fixture uses
  synthetic Harness receipts to exercise settlement refusal, unknown ignored-file
  refusal, immutable request replay, safe branch/worktree removal and card completion.
  It does not claim live provider compliance or perform a live merge.
- Updating the Codethread dependency pin requires the supported Weaver restart,
  with explicit user approval. Source-only module edits use normal refresh.
  Never bypass the dependency-basis check with runtime or classloader mutation.
- This handoff is a source-only delivery-policy change. Normal module refresh
  updates new workflow runs, not instructions already poured into existing runs.
  Do not restart, relabel, or rearm existing assignments to apply it retroactively.
