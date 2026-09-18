# Diagnosis and recovery

First inspect the card's latest notes, receipt, exact `agent show`, workflow
`ready`, and retained branch/worktree. Separate dispatch, worker, executor and
merge failures; report the actual owner (seat + effort or special executor).
Absence of active runs proves neither success nor settlement.

For this repository's autonomous delivery failure: add `auto-run-failure`, note
run/step, failing command/evidence, retained resources and held merge reservation,
then stop for manual intervention. Do not clear errors, retry gates, spawn a
replacement, withdraw the merge turn, or re-merge already-landed work. Best-effort
label failure must be reported too. This policy overrides generic repair advice.
Normal queue waits and bounded-await timeouts are not delivery failures.

For **authorized** ordinary worker interruption outside that stop policy:

```nu
strand --workspace $ws agent stop $run --reason $reason --by-identity $actor
strand --workspace $ws await --query agent-run-settled --param $'run-id=($run)' --min-count 1 --timeout-secs 1800
strand --workspace $ws agent show $run --by-identity $actor
```

Stopping does not close the feature. After confirmed settlement, update feature
and task notes with a primer explicitly superseding old instructions. Choose one
continuation from the latest accepted lineage head:

```nu
strand --workspace $ws agent resume --run-id $run --prompt $primer --request-id $request --by-identity $actor
# Or a fresh session, preserving predecessor policy:
strand --workspace $ws agent assign $seat --task $card --cwd $workdir --after $run --request-id $request --by-identity $actor
```

Native resume retains provider/session/settings/target/frozen guidance; a failed
resume does not authorize a fresh replacement. `agent retry` is for eligible
failed ad-hoc runs, not targeted or request-ID-bound assignments.

For an orphan projection, first `agent reconcile RUN --dry-run --by-identity ACTOR`.
Do not assert abandonment without evidence and authorization. Abandoned is not
settled: reservations remain and native resume is forbidden. Never delete runtime
records or change process ownership evidence to force progress.

## Weaver activation boundary

Use `mill prime millstrand` and current `mill weaver --help` before operational
changes. Source-only workspace module edits use supported refresh; dependency
basis/pin changes require supported restart with explicit user approval. Inspect
pool membership: a shared host may affect other workspaces. Never stop a Weaver
or unrelated process to unstick a worker, and never bypass the basis guard through
runtime/classloader mutation. Refresh changes future workflow definitions, not
instructions already poured into an existing run. Do not relabel/rearm assignments
to apply changes retroactively. If live help differs, inspect its provenance and
the active pin before suggesting a configuration change.
