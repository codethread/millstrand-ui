import type { AgentIdentity, AgentRun } from '../../shared/api';
import { effortLabel, runDisplayName } from '../lib/agents';
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
  const { focusAgentRun } = useDashboardActions();
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
            <span className="font-medium">{runDisplayName(run)}</span>{' '}
            <span className="issue-id">{run.id}</span>
            <AgentRunStatus run={run} stale={stale} />
          </summary>
          <AgentRunDetails run={run} showReply={run.id === selectedRunId} />
        </details>
      ))}
    </section>
  );
}

export function AgentRunDetails({ run, showReply }: { run: AgentRun; showReply: boolean }) {
  const { focusAgentRun } = useDashboardActions();
  return (
    <>
      <p className="mb-4 mt-3 text-sm">{run.title}</p>
      {showReply && <AgentRunReply id={run.id} />}
      <dl className="property-list">
        <dt>Provider</dt>
        <dd>
          {run.harness} · {run.mode}
        </dd>
        <dt>Launch alias</dt>
        <dd>{run.alias ?? 'None recorded'}</dd>
        <dt>Observed model</dt>
        <dd>{run.model ?? 'Not observed yet'}</dd>
        <dt>Observed effort</dt>
        <dd>{effortLabel(run.effort)}</dd>
        <dt>Process custody</dt>
        <dd>
          {run.ownership === 'external'
            ? 'External direct session · not managed by Harnesses'
            : 'Managed run'}
        </dd>
        <dt>Directory</dt>
        <dd className="font-mono text-xs">{run.cwd ?? 'Not recorded'}</dd>
        <dt>Target</dt>
        <dd>{run.target ?? 'No explicit target'}</dd>
        <dt>Contributors</dt>
        <dd>
          {run.participants.length > 0
            ? run.participants.map((participant) => attributionLabel(participant)).join(', ')
            : 'Identity registration pending · no published actor'}
        </dd>
        {run.continuation !== null && (
          <>
            <dt>Continuation</dt>
            <dd>
              {run.continuation.kind === 'native-resume' ? 'Native resume of ' : 'Fresh retry of '}
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
    </>
  );
}
