# Agent log lab (POC)

Three isolated viewers for real dialogue logs. No Harnesses integration, lifecycle
inference, mutations, or token streaming. The normal dashboard is unchanged.

| Port | Concept            | Optimizes for                                                          |
| ---- | ------------------ | ---------------------------------------------------------------------- |
| 4311 | Console            | Dense event tail, searchable commands/paths, expandable raw records    |
| 4312 | Conversation       | Markdown prompts/replies with adjacent tool events folded together     |
| 4313 | Activity inspector | Newest-first timeline, selected-event evidence, bounded summary counts |

Run each command in a separate terminal from this feature worktree:

```nu
pnpm log:lab --concept console
pnpm log:lab --concept conversation
pnpm log:lab --concept inspector
```

The processes serve UI and API together on `127.0.0.1`. Ports can be overridden
with `--port`. Binding to LAN via `--host 0.0.0.0` exposes private prompts,
commands, and paths without authentication: do so only deliberately on a trusted
network. Markdown images and raw HTML are not rendered. Source files are never
modified. No source logs or screenshots containing their contents are committed.

## Behavior and limits

- Reads top-level JSONL files in `~/.local/state/{pi,codex,claude}-dialogue`.
- Lists 30 most recently modified files per harness, refreshed every 15 seconds.
- Selection lives in the URL and is retained when comparing ports. Back works.
- A selected file is watched every second. SSE carries an initial snapshot and
  refreshed bounded snapshots when its mtime/size changes, not individual tokens.
- Retains at most 400 complete records from the final 1 MiB. Byte offsets identify
  records. The UI reports truncation and malformed/unsupported complete records;
  incomplete final lines are deferred until their newline arrives.
- Pause closes the subscription and freezes the cached snapshot; Resume catches
  up from the file. Temporary read/connection failures retain the last snapshot
  with an error, with automatic reconnection. Follow tail can be disabled; scrolling
  up disables it. The inspector is newest-first and keeps an explicitly selected
  event instead of scrolling with arrivals.
- Search and type filters apply to the retained window. Inspector counts describe
  that filtered window, not whole-run totals or successful tool executions.
- Watching a file proves only the connection is open. Log timestamps, session-end
  records, and activity are shown as recorded; none prove a process is alive.
  Claude/Pi file capture and Codex command capture differ; missing output is not
  fabricated. No full tool stdout/stderr, reasoning, or token telemetry is available
  in these stable dialogue logs.
- This is a Vite-backed development lab, not part of the production build entry.

## Verification

`pnpm quality` covers strict TypeScript, zero-warning lint, formatting, 300 tests,
and the unchanged production dashboard build. Focused tests cover byte offsets,
partial writes, malformed lines, record caps, symlinks/traversal, recent-session
selection, conversation folding, and search.

Browser checks cover all three ports, desktop/narrow layouts, session selection,
filters, pause/resume, event inspection, and retained failure states. A live SSE
check against the implementation session observed event counts increase from 38
to 40 without modifying source logs manually.
