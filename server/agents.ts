import type { AgentIdentity, AgentRun, AgentRunStatus, AgentWork } from '../shared/api.ts';
import { array, maybeString, parseWork, string } from './parse.ts';

/** List projections omit large prompt/result values. Only expose inspection fields,
 * never provider environment, injected prompts, or credentials through this API. */
export function parseAgents(value: unknown): AgentIdentity[] {
  const rows = array(value, 'agent strands').map(parseWork);
  const runs = new Map<string, AgentRun[]>();
  const work = new Map<string, AgentWork[]>();
  for (const row of rows) {
    const attrs = row.attributes;
    // Historical published runs can predate identity linkage and cannot join an identity.
    if (
      attrs['harness/run'] === 'true' &&
      attrs['harness/published'] === 'true' &&
      attrs['identity/id'] != null
    ) {
      const identity = string(attrs['identity/id'], 'run.identity/id');
      const statuses: AgentRunStatus[] = ['ready', 'running', 'stopped', 'failed'];
      const run: AgentRun = {
        id: row.id,
        requestId: maybeString(attrs['harness/request-id'], 'run.requestId'),
        title: row.title,
        alias: string(attrs['harness/alias'], 'run.alias'),
        harness: string(attrs['harness/harness'], 'run.harness'),
        status: statuses.find((status) => status === attrs['harness/status']) ?? 'unknown',
        substatus: maybeString(attrs['harness/substatus'], 'run.substatus'),
        mode: string(attrs['harness/mode'], 'run.mode'),
        model: maybeString(attrs['harness/model'], 'run.model'),
        effort: maybeString(attrs['harness/effort'], 'run.effort'),
        cwd: maybeString(attrs['harness/cwd'], 'run.cwd'),
        target: maybeString(attrs['harness/target'], 'run.target'),
        rootTargets:
          attrs['harness/root-targets'] == null
            ? []
            : array(attrs['harness/root-targets'], 'run.rootTargets').map((id) =>
                string(id, 'run.rootTarget'),
              ),
        createdAt: string(row.createdAt, 'run.createdAt'),
        startedAt: maybeString(attrs['harness/started-at'], 'run.startedAt'),
        finishedAt: maybeString(attrs['harness/finished-at'], 'run.finishedAt'),
      };
      runs.set(identity, [...(runs.get(identity) ?? []), run]);
    }
    if (typeof attrs['owner'] === 'string') {
      const owner = attrs['owner'];
      work.set(owner, [
        ...(work.get(owner) ?? []),
        {
          id: row.id,
          title: row.title,
          state: row.state,
          kind:
            attrs['kanban/card'] === 'true'
              ? 'card'
              : attrs['kanban/task'] === 'true'
                ? 'task'
                : 'work',
        },
      ]);
    }
  }
  return rows
    .filter((row) => row.attributes['identity/session'] === 'true')
    .map((row) => {
      const attrs = row.attributes;
      const id = string(attrs['identity/id'], 'identity.id');
      return {
        id,
        strandId: row.id,
        harness: string(attrs['identity/harness'], 'identity.harness'),
        model: maybeString(attrs['identity/model'], 'identity.model'),
        effort: maybeString(attrs['identity/thinking-level'], 'identity.effort'),
        createdAt: string(row.createdAt, 'identity.createdAt'),
        runs: (runs.get(id) ?? []).sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        ),
        work: work.get(id) ?? [],
      };
    });
}
