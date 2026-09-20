import { useSelectedAgentActivity, useAgentStatus } from '../hooks/use-agents';
import { formatDate } from '../lib/board';
import { useDashboardActions } from '../lib/navigation';
import { AgentSessionLog } from './card-agent-log';
import { AgentRunHistory } from './agent-run-history';
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
  const title = activity?.identity.id ?? identityId ?? runId ?? 'Agent run';
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
            Agent identity · read-only session and work inspection
          </SheetDescription>
          {activity && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <strong className="text-primary">
                {activity.currentRun?.alias ?? activity.identity.harness}
              </strong>
              <AgentRunStatus run={activity.currentRun} stale={health.error !== null} />
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
            />
            <AgentRunHistory
              identity={activity.identity}
              selectedRunId={activity.selectedRun?.id ?? null}
              stale={health.error !== null}
            />
            <dl className="property-list mb-7">
              <dt>Provider</dt>
              <dd>{activity.currentRun?.harness ?? activity.identity.harness}</dd>
              <dt>Model</dt>
              <dd>{activity.currentRun?.model ?? activity.identity.model ?? 'Not recorded'}</dd>
              <dt>Effort</dt>
              <dd>{activity.currentRun?.effort ?? activity.identity.effort ?? 'Not recorded'}</dd>
              <dt>Created</dt>
              <dd>{formatDate(activity.identity.createdAt)}</dd>
              <dt>Identity strand</dt>
              <dd className="font-mono">{activity.identity.strandId}</dd>
            </dl>
            <section className="detail-section">
              <h3 className="detail-section-title">Owned work · {activity.identity.work.length}</h3>
              <p className="detail-empty mb-3">
                Ownership can outlast a session. A running session alone does not prove work on
                every owned item.
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
                  No work currently records this identity as its owner.
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
          ? 'Resolving the identity for this exact run…'
          : 'This run is not linked to a published identity in the latest directory.'}
      </p>
      <AgentRunReply id={id} />
    </div>
  );
}
