import type { AgentIdentity } from '../../shared/api';
import { attributionLabel } from '../lib/provenance';
import { useDashboardActions } from '../lib/navigation';
import { AgentRunReply } from './agent-run-reply';
import { AgentRunStatus } from './agent-status';

export function AgentRunHistory({
  identity,
  selectedRunId,
  stale,
}: {
  identity: AgentIdentity;
  selectedRunId: string | null;
  stale: boolean;
}) {
  const { focusAgentRun, openCard } = useDashboardActions();
  return (
    <section className="detail-section">
      <h3 className="detail-section-title">Run history · {identity.runs.length}</h3>
      {identity.runs.length === 0 && (
        <p className="detail-empty">
          No published tracked runs. This identity’s live activity is unknown.
        </p>
      )}
      {identity.runs.map((run) => (
        <details key={run.id} className="agent-run" open={run.id === selectedRunId}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              focusAgentRun(run.id);
            }}
          >
            <span className="font-medium">{run.alias}</span>{' '}
            <span className="issue-id">{run.id}</span>
            <AgentRunStatus run={run} stale={stale} />
          </summary>
          <p className="mb-4 mt-3 text-sm">{run.title}</p>
          {run.id === selectedRunId && <AgentRunReply id={run.id} />}
          <dl className="property-list">
            <dt>Provider</dt>
            <dd>
              {run.harness} · {run.mode}
            </dd>
            <dt>Model</dt>
            <dd>{run.model ?? 'Not recorded'}</dd>
            <dt>Effort</dt>
            <dd>{run.effort ?? 'Not recorded'}</dd>
            <dt>Directory</dt>
            <dd className="font-mono text-xs">{run.cwd ?? 'Not recorded'}</dd>
            <dt>Target</dt>
            <dd>{run.target ?? 'No explicit target'}</dd>
            {run.workflow !== null && (
              <>
                <dt>Workflow</dt>
                <dd>
                  <button
                    className="text-left text-primary hover:underline"
                    onClick={() => openCard(run.workflow!.cardId)}
                  >
                    View feature {run.workflow.cardId}
                  </button>
                  {' · '}
                  {run.workflow.role ?? 'workflow agent'} · {run.workflow.runId}
                </dd>
              </>
            )}
            <dt>Contributors</dt>
            <dd>
              {run.participants.length > 0
                ? run.participants.map((participant) => attributionLabel(participant)).join(', ')
                : 'No published participants'}
            </dd>
            {run.continuation !== null && (
              <>
                <dt>Continuation</dt>
                <dd>
                  {run.continuation.kind === 'native-resume'
                    ? 'Native resume of '
                    : 'Fresh retry of '}
                  <button
                    className="text-left text-primary hover:underline"
                    onClick={() => focusAgentRun(run.continuation!.predecessorRunId)}
                  >
                    {run.continuation.predecessorRunId}
                  </button>
                </dd>
              </>
            )}
            {run.rootTargets.length > 0 && (
              <>
                <dt>Work roots</dt>
                <dd>{run.rootTargets.join(', ')}</dd>
              </>
            )}
            <dt>Started</dt>
            <dd>{run.startedAt ?? 'Not recorded'}</dd>
            <dt>Finished</dt>
            <dd>{run.finishedAt ?? 'Not recorded'}</dd>
          </dl>
        </details>
      ))}
    </section>
  );
}
