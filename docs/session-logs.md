# Agent session logs

Agent log activity and session viewers are part of the canonical dashboard. Standard
`pnpm dev`, `pnpm build`, and `pnpm start` include the roster, compact tails, and
expanded **Conversation**, **Inspector**, and **Console** views; there are no enable
flags or separate log servers.

## Dashboard behavior

The overview shows a compact latest-recorded-event hint for agents with a linked
dialogue session. Card and agent detail surfaces show a compact tail. Expanding a
log opens the shared session viewer, where **Conversation** groups prompts and
replies with adjacent tool activity, **Inspector** presents a newest-first event
timeline, and **Console** provides a dense event tail. The viewer can pause its
stream, filter the retained window, follow new records, and keep one inspected event
selected.

Session associations use exact persisted session IDs and providers. An exact run
inspector uses that run's `harness/session-id`, including while its published native
participant is still pending. An identity-level view uses its running performed run,
then `identity/native-session-id`, then the newest performed run session for history.
Associations are never inferred from a friendly identity, workspace, model, or file
timestamp. A session stream is the
native session's dialogue, not work exclusively for the selected card, task, or run.
The UI labels ownership-only associations accordingly.

A card's roster combines its current feature/task owners and linked runs. A targeted
published run remains visible as **Identity registration pending** until `performed`
is persisted; it is not assigned a synthetic actor. Current owners and
directly/root-targeted running work appear first; completed task owners and terminal
linked runs remain available in **Past work**. Desktop layouts select a shared row,
narrow layouts use a selector, and the task popover provides the related context.

## External session activity

Harnesses manages the lifecycle of runs it launches, so those **managed** runs keep
their recorded status. They are never aged out by silence, with one exception: a
running managed run is shown as idle, and leaves current lists and active counts, when
the latest record in its own session's dialogue log is a top-level session-end written
at or after the run's registration/start. Its recorded Harnesses status is not
changed, and the run stays in the agent's history.

- A newer run registered on the same native session after that end is not affected.
- Any later captured record (a resumed or continued session) restores the run on the
  next agents poll.
- A child's tagged end never ends a run, and Codex child runs are never ended by
  their parent's end.
- A managed run with no capture, or whose latest record is not an end, keeps its
  lifecycle status. The dashboard cannot detect a managed process that exited
  without a captured end.

An **external** session (started directly in Claude, Codex, or Pi and registered at
startup) is recorded as running and is never settled or heartbeated by Harnesses. The
dashboard therefore infers whether it is still active from its registration/start
timestamps and its locally readable dialogue log:

- It shows as idle (**Session idle**, **Idle**) once more than an hour has passed
  since the latest of registration, start, or captured dialogue evidence.
- If the latest captured record is that session's own session-end, it is idle
  immediately rather than after an hour.
- Newly captured activity restores it to recent/active on the next agents poll,
  roughly every five seconds.
- Codex child-agent activity is captured in the parent's dialogue log tagged with the
  child's ID. Only events tagged for a child count as that child's evidence; parent
  events do not revive a child, and child events do not end the parent.

Idle is an inference, not an observation of the process. It cannot tell whether the
session is still executing remotely, whether its process has exited, or whether it
can be resumed.

If a session has no dialogue capture (no log file, or for a Codex child no readable
child-tagged record), there is no ongoing activity evidence. The one-hour window then
runs from registration/start alone, and renewed activity cannot restore the session
until a capture is written. This limitation is accepted; the dashboard does not probe
processes or providers to work around it.

A capture that exists but cannot be read (for example a permission or I/O error) is
not treated as missing and does not silently produce idle. The agents refresh fails
visibly and the dashboard keeps last-known data until the read succeeds.

The overview's **Running, but quiet** grouping (no recorded event for five minutes)
is a separate, shorter hint and does not change a session's idle state.

## Data, polling, and bounds

The server reads dialogue JSONL files from
`~/.local/state/{pi,codex,claude}-dialogue`. It reads a bounded tail, retaining at
most 400 complete records from the final 1 MiB of a session file. It reports
truncation and skips malformed or unsupported complete records. An incomplete final
line waits for its newline rather than being treated as a record.

`GET /api/log-activity?workspace=...` supplies identity-to-session bindings and
latest-event summaries. It is polled every five seconds by the overview or
selected-workspace poll owner. `GET /api/session-logs/snapshot?provider=...&session=...`
returns a bounded snapshot. `GET /api/session-logs/stream?provider=...&session=...`
opens the corresponding SSE stream; a visible compact tail or expanded viewer owns
that connection. The compact subscription pauses while the expanded viewer is open.
Temporary source and connection failures retain the last snapshot with explicit
status instead of claiming the data is live.

The session viewer reports recorded dialogue only. It does not claim that a process
is alive, that a session belongs exclusively to the selected work, or that it has
whole history, token telemetry, reasoning, or full tool stdout/stderr.

## LAN exposure

The normal server binds to the LAN without authentication. This deliberately exposes
private prompts, commands, and paths to clients that can reach it, including the
session-log source endpoints when a client knows a provider and session ID. Use a
trusted network, bind to localhost, or use the SSH tunnel described in the README.
This MVP does not provide a new security model.

## Implementation map

- `server/session-log-reader.ts` reads bounded dialogue snapshots.
- `server/session-logs.ts` validates sources and serves snapshot and SSE requests.
- `shared/session-log.ts` defines the normalized dialogue contracts.
- `src/lib/api/session-logs.ts` owns snapshot keys and stream URLs.
- `src/hooks/use-session-log.ts` owns a visible viewer's SSE lifecycle.
- `src/components/session-log-views.tsx` renders Conversation, Inspector, and
  Console.
- `src/log-ui-store.ts` owns viewer interaction state, including follow and the
  inspected event.
