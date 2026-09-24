import { useSelectedAgentActivity, useAgentStatus } from '../hooks/use-agents';
import { effortLabel, runDisplayName } from '../lib/agents';
import { formatDate } from '../lib/board';
import { useDashboardActions } from '../lib/navigation';
import { AgentSessionLog } from './card-agent-log';
import { AgentRunDetails, AgentRunHistory } from './agent-run-history';
import { AgentRunReply } from './agent-run-reply';
import { AgentRunStatus } from './agent-status';
import { ErrorNotice, Loading } from './issue-parts';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';

export function AgentDetail({
  identityId,
  runId,
}: {
  identityId: string | null;
  runId: string | null;
}) {
  const selection = useSelectedAgentActivity(identityId, runId);
  const health = useAgentStatus();
  const { closeAgent, openCard } = useDashboardActions();
  const activity = selection.data;
  const title =
    activity?.kind === 'identity'
      ? activity.identity.id
      : activity?.kind === 'run'
        ? activity.run.id
        : (identityId ?? runId ?? 'Agent run');
  const headingRun =
    activity?.kind === 'identity'
      ? (activity.selectedRun ?? activity.currentRun)
      : activity?.kind === 'run'
        ? activity.run
        : null;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) closeAgent();
      }}
    >
      <SheetContent className="issue-sheet sm:max-w-[650px]">
        <div className="detail-heading pr-12">
          <SheetTitle className="break-words">{title}</SheetTitle>
          <SheetDescription>
            {activity?.kind === 'run'
              ? activity.run.participants.length === 0
                ? 'Published run · native identity registration pending'
                : 'Published run · multiple participants'
              : 'Agent identity · read-only session and work inspection'}
          </SheetDescription>
          {headingRun && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <strong className="text-primary">{runDisplayName(headingRun)}</strong>
              <AgentRunStatus run={headingRun} stale={health.error !== null} />
            </div>
          )}
        </div>
        {health.error && <ErrorNotice error={health.error} />}
        {activity === undefined ? (
          runId ? (
            <UnlinkedAgentRun id={runId} loadingIdentity={!health.error} />
          ) : health.error ? (
            <Button
              className="m-6"
              variant="outline"
              onClick={() => {
                void health.refetch();
              }}
            >
              Retry identity
            </Button>
          ) : (
            <Loading text="Loading identity…" />
          )
        ) : activity === null ? (
          runId ? (
            <UnlinkedAgentRun id={runId} loadingIdentity={false} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              This identity was not found in the selected workspace.
            </p>
          )
        ) : activity.kind === 'run' ? (
          <div className="detail-body border-t border-border p-5">
            <p className="mb-5 text-sm text-muted-foreground">
              {activity.run.participants.length === 0
                ? 'This persisted run has no published performed participant yet. The dashboard keeps its exact run and target visible without assigning an actor.'
                : 'This run has multiple published participants. The dashboard keeps the shared run inspectable without choosing a primary actor.'}
            </p>
            <AgentSessionLog identity={`Run ${activity.run.id}`} run={activity.run} />
            <section className="detail-section">
              <h3 className="detail-section-title">Run inspection</h3>
              <AgentRunDetails run={activity.run} showReply />
            </section>
          </div>
        ) : (
          <div className="detail-body border-t border-border">
            {activity.requestedRunMissing && runId && (
              <div className="m-5 space-y-3">
                <p role="alert" className="text-sm text-destructive">
                  Run {runId} is not published for this identity. Its direct reply and the
                  identity’s other recorded runs remain available.
                </p>
                <AgentRunReply id={runId} />
              </div>
            )}
            <AgentSessionLog
              identity={activity.identity.id}
              identityStrandId={activity.identity.strandId}
              run={activity.selectedRun}
            />
            <AgentRunHistory
              identity={activity.identity}
              selectedRunId={activity.selectedRun?.id ?? null}
              stale={health.error !== null}
            />
            <dl className="property-list mb-7">
              <dt>Provider</dt>
              <dd>{activity.currentRun?.harness ?? activity.identity.harness}</dd>
              <dt>Observed model</dt>
              <dd>{activity.currentRun?.model ?? activity.identity.model ?? 'Not recorded'}</dd>
              <dt>Observed effort</dt>
              <dd>{effortLabel(activity.currentRun?.effort ?? activity.identity.effort)}</dd>
              <dt>Created</dt>
              <dd>{formatDate(activity.identity.createdAt)}</dd>
              <dt>Identity strand</dt>
              <dd className="font-mono">{activity.identity.strandId}</dd>
              {activity.identity.parentIdentityStrandIds.length > 0 && (
                <>
                  <dt>
                    Native parent{activity.identity.parentIdentityStrandIds.length > 1 && 's'}
                  </dt>
                  <dd className="font-mono">
                    {activity.identity.parentIdentityStrandIds.join(', ')}
                  </dd>
                </>
              )}
            </dl>
            <section className="detail-section">
              <h3 className="detail-section-title">Owned work · {activity.identity.work.length}</h3>
              <p className="detail-empty mb-3">
                Explicit claims can outlast a session. A managed run or running session does not
                claim work and does not prove activity on every owned item.
              </p>
              {activity.identity.work.map((work) => (
                <div key={work.id} className="relation-row flex-wrap">
                  <span className="issue-id">{work.id}</span>
                  {work.kind === 'card' ? (
                    <button
                      className="text-left hover:text-primary"
                      onClick={() => openCard(work.id)}
                    >
                      {work.title}
                    </button>
                  ) : (
                    <span>{work.title}</span>
                  )}
                  <span className="ml-auto text-[10px]">
                    {work.kind} · {work.state}
                  </span>
                </div>
              ))}
              {activity.identity.work.length === 0 && (
                <p className="detail-empty">
                  No work currently records this identity as its explicit owner.
                </p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function UnlinkedAgentRun({ id, loadingIdentity }: { id: string; loadingIdentity: boolean }) {
  return (
    <div className="space-y-4 border-t border-border p-6">
      <p className="text-sm text-muted-foreground">
        {loadingIdentity
          ? 'Resolving persisted evidence for this exact run…'
          : 'This run is not present in the latest persisted directory.'}
      </p>
      <AgentRunReply id={id} />
    </div>
  );
}
