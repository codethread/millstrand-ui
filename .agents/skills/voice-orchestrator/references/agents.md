# Agents and worktrees

Use `$ws`, `$actor`, `$card`, `$workdir`, `$seat`, `$effort` and `$request` from
confirmed workspace/identity/work scope. Read live help before execution.

```nu
strand --workspace $ws prime agent
strand --workspace $ws agent list --by-identity $actor
strand --workspace $ws agent runs --active --by-identity $actor
strand --workspace $ws agent runs --task $card --by-identity $actor
wktree -h
```

Choose an available seat from the registry's resolved model/effort and guidance,
not its nickname alone. Prepare a worktree using repository policy and wktree's
live help; do not create one when assignment already supplies it. Assignment
requires an explicit cwd and creates no worktree. Put bounded instructions,
acceptance, verification, stop condition and delivery policy on the target first.

```nu
strand --workspace $ws agent assign $seat --task $card --cwd $workdir --policy stop-on-complete --request-id $request --by-identity $actor
# For a bounded prompted investigation instead:
strand --workspace $ws agent run $seat --target $card --cwd $workdir --effort $effort --prompt $prompt --request-id $request --by-identity $actor
strand --workspace $ws agent show --request $request --by-identity $actor
```

`assign` does not accept run's `--effort`: consult its provider-overlay contract
if overriding settings. Do not substitute guessed JSON fields. The worker claims
its feature; competing writers are rejected. Blocked assignments can queue until
depends-on blockers close. Independent targets can run concurrently.

Default `stop-on-complete` leaves the feature open for coordinator acceptance;
`close-on-complete` instructs the worker to finish it. These are guidance, not
automatic closure. Repository policies may differ and are frozen at assignment.

```nu
strand --workspace $ws await --query agent-run-terminal --param $'run-id=($run)' --min-count 1 --timeout-secs 1800
strand --workspace $ws agent show $run --by-identity $actor
```

Inspect result and exit evidence after waking. Terminal is not success; use
`agent-run-settled` when provider disappearance is required. With default policy,
wait on the run first, not the still-open feature. If closure is owned elsewhere,
`agent-work-complete-or-intervention --param target=ID` wakes for completion or
intervention; the work-root variant includes failed assigned descendants. Use
`query explain` to confirm contracts, and positive `--min-count 1` evidence.
