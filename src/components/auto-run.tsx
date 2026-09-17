import { Fragment } from 'react';
import type { AutoRun } from '../../shared/api';
import { cn } from '../lib/utils';

const dispatchLabels = {
  preparing: 'Preparing',
  assigned: 'Assigned',
  error: 'Error',
};

function DispatchStatus({ autoRun }: { autoRun: AutoRun }) {
  return (
    <span className={cn(autoRun.status === 'error' && 'text-destructive')}>
      Dispatch: {autoRun.status === null ? 'Not recorded' : dispatchLabels[autoRun.status]}
    </span>
  );
}

export function AutoRunSummary({ autoRun }: { autoRun: AutoRun | null }) {
  if (autoRun === null) return null;
  return (
    <div className="min-w-0 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-foreground">Auto-run</span>
        <span>{autoRun.optedIn ? 'Opted in' : 'Not opted in'}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 [overflow-wrap:anywhere]">
        {autoRun.seat !== null && <span>Seat: {autoRun.seat}</span>}
        {autoRun.effort !== null && <span>Effort: {autoRun.effort}</span>}
        {autoRun.workflow !== null && <span>Delivery: {autoRun.workflow}</span>}
      </div>
      <DispatchStatus autoRun={autoRun} />
    </div>
  );
}

export function AutoRunDetails({ autoRun }: { autoRun: AutoRun | null }) {
  if (autoRun === null) return null;
  const configuration = [
    { label: 'Seat alias', value: autoRun.seat },
    { label: 'Effort', value: autoRun.effort },
    { label: 'Delivery workflow', value: autoRun.workflow },
  ];
  const snapshot = [
    { label: 'Harnesses assignment', value: autoRun.runId },
    { label: 'Workflow run', value: autoRun.workflowRunId },
    { label: 'Dispatch branch', value: autoRun.branch },
    { label: 'Dispatch worktree', value: autoRun.worktree },
  ];
  return (
    <section className="detail-section" aria-label="Auto-run properties">
      <h3 className="detail-section-title">Auto-run</h3>
      <p className="mb-3 text-sm">
        {autoRun.optedIn ? 'Opted in' : 'Not opted in'}
        <span className="text-muted-foreground"> · Configuration, not worker activity</span>
      </p>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-2 text-sm">
        {configuration.map(({ label, value }) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">{value ?? 'Not set'}</dd>
          </Fragment>
        ))}
      </dl>
      <div className="mt-4 space-y-3 border-t border-border pt-3 text-sm">
        <h4 className="font-medium">Dispatcher snapshot</h4>
        <DispatchStatus autoRun={autoRun} />
        {autoRun.error !== null && (
          <p className="whitespace-pre-wrap text-destructive [overflow-wrap:anywhere]">
            Dispatch error: {autoRun.error}
          </p>
        )}
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-2 text-xs">
          {snapshot.map(({ label, value }) =>
            value === null ? null : (
              <Fragment key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 font-mono [overflow-wrap:anywhere]">{value}</dd>
              </Fragment>
            ),
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          Opt-in does not confirm eligibility or a running worker. Dispatch records an assignment,
          not its current activity; use the agent badges and Agents view for worker status.
        </p>
      </div>
    </section>
  );
}
