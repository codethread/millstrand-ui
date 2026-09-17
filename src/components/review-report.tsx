import type { ReactNode } from 'react';
import { ArrowUpRight, Bot, CheckCheck } from 'lucide-react';
import { formatDate } from '../lib/board';
import type { ReviewDetailModel } from '../lib/reviews';
import { cn } from '../lib/utils';
import { Markdown } from './markdown';
import { ReviewStatus } from './review-parts';
import { Button } from './ui/button';

/** Stable slots owned by review browsing. Curation supplies comments without owning
 * report layout; prompting stays the shared page-independent entry. */
export interface ReviewReportIntegrations {
  prompt: ReactNode;
  comments: ReactNode;
}

export interface ReviewReportProps {
  model: ReviewDetailModel;
  reviewerRunIdentities: Readonly<Record<string, string>>;
  integrations: ReviewReportIntegrations;
  onOpenAgentRun: (identity: string, runId: string) => void;
  onOpenHistory: (reviewId: string) => void;
  onOpenRelatedStrand: (strandId: string) => void;
}

export function ReviewReport({
  model,
  reviewerRunIdentities,
  integrations,
  onOpenAgentRun,
  onOpenHistory,
  onOpenRelatedStrand,
}: ReviewReportProps) {
  const detail = model.review;
  return (
    <>
      <section className="border-b border-border p-5 md:p-7">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ReviewStatus review={detail} />
          <span
            className={cn(
              'text-xs',
              detail.current ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300',
            )}
          >
            {detail.current ? 'Current at last poll' : 'Outdated at last poll'}
          </span>
          <code className="ml-auto text-[10px] text-muted-foreground">{detail.id}</code>
        </div>
        <h2 className="break-words text-xl font-semibold tracking-tight">{model.heading}</h2>
        {integrations.prompt}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{detail.repo ?? 'Repository unavailable'}</span>
          {detail.mr.iid !== null && <span>· MR !{detail.mr.iid}</span>}
          {detail.mr.url && (
            <a
              className="inline-flex items-center gap-1 text-primary underline"
              href={detail.mr.url}
              target="_blank"
              rel="noreferrer"
            >
              Open merge request <ArrowUpRight className="size-3" />
            </a>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {detail.mr.sourceBranch && (
            <span className="break-all">
              {detail.mr.sourceBranch} → {detail.mr.targetBranch ?? 'target'}
            </span>
          )}
          {detail.mr.sha && <code title={detail.mr.sha}>{detail.mr.sha.slice(0, 12)}</code>}
          <span>Started {formatDate(detail.createdAt)}</span>
          {detail.completedAt && <span>Completed {formatDate(detail.completedAt)}</span>}
        </div>
        {model.currentness.kind === 'outdated' && (
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
            This revision was no longer current or open in the last successful poll. Its evidence is
            preserved.
            {model.currentness.pendingDecision && ' It still awaits a local decision.'}
          </p>
        )}
      </section>
      <section className="p-5 md:p-7" aria-label="Review report">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <CheckCheck className="size-4 text-primary" />
          Review report
        </h3>
        {model.report.kind === 'available' ? (
          <Markdown text={model.report.markdown} />
        ) : (
          <p className="text-sm text-muted-foreground">{model.report.message}</p>
        )}
      </section>
      {integrations.comments}
      <section className="border-t border-border p-5 md:p-7" aria-label="Reviewer evidence">
        <h3 className="mb-4 text-sm font-semibold">
          Reviewer evidence{' '}
          <span className="text-muted-foreground">· {detail.reviewers.length}</span>
        </h3>
        {detail.reviewers.length === 0 && (
          <p className="text-sm text-muted-foreground">No reviewers have been assigned yet.</p>
        )}
        <div className="space-y-3">
          {detail.reviewers.map((seat) => {
            const runId = seat.runId;
            const identity = runId === null ? undefined : reviewerRunIdentities[runId];
            return (
              <details
                key={seat.id}
                className="overflow-hidden rounded-lg border border-border"
                open={detail.report === null}
              >
                <summary className="cursor-pointer px-4 py-3 text-sm">
                  <span className="font-medium">{seat.name}</span>
                  <span className="ml-3 text-xs text-muted-foreground">
                    {[seat.status, seat.substatus].filter(Boolean).join(' · ') || 'Waiting'}
                  </span>
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  {runId && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <code className="break-all text-muted-foreground">Run {runId}</code>
                      {identity && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenAgentRun(identity, runId)}
                        >
                          <Bot />
                          Inspect agent run
                        </Button>
                      )}
                    </div>
                  )}
                  {seat.error && (
                    <div
                      role="alert"
                      className="rounded-md bg-amber-50 p-3 text-sm break-words whitespace-pre-wrap text-amber-900"
                    >
                      {seat.error}
                    </div>
                  )}
                  {seat.result ? (
                    <Markdown text={seat.result} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No reviewer result yet.</p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>
      {detail.links.length > 0 && (
        <section className="border-t border-border p-5 md:p-7" aria-label="Related work">
          <h3 className="mb-3 text-sm font-semibold">Related work</h3>
          <div className="flex flex-wrap gap-2">
            {detail.links.map((link) => (
              <button
                key={`${link.type}:${link.id}`}
                className="rounded-md border border-border px-3 py-2 text-left text-xs hover:bg-muted"
                onClick={() => onOpenRelatedStrand(link.id)}
                aria-label={`Open related strand ${link.id}`}
              >
                {link.title} <code className="text-muted-foreground">{link.id}</code> · {link.type}
              </button>
            ))}
          </div>
        </section>
      )}
      {detail.history.length > 0 && (
        <section className="border-t border-border p-5 md:p-7" aria-label="Review history">
          <h3 className="mb-3 text-sm font-semibold">Review history</h3>
          <div className="space-y-2">
            {detail.history.map((review) => (
              <button
                key={review.id}
                className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border p-3 text-left text-xs hover:bg-muted"
                onClick={() => onOpenHistory(review.id)}
              >
                <code>{review.mr.sha?.slice(0, 12) ?? review.id}</code>
                <span>{formatDate(review.createdAt)}</span>
                <ReviewStatus review={review} />
                <span className="ml-auto text-muted-foreground">
                  {review.current ? 'Current' : 'Outdated'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {detail.notes.length > 0 && (
        <details className="border-t border-border p-5 md:p-7">
          <summary className="cursor-pointer text-sm font-semibold">
            Activity · {detail.notes.length} notes
          </summary>
          <div className="mt-4 space-y-5">
            {detail.notes.map((note) => (
              <article key={note.id}>
                <div className="mb-2 text-xs text-muted-foreground">
                  {note.by ?? 'System'} · {formatDate(note.at)}
                  {note.kind && ` · ${note.kind}`}
                </div>
                <Markdown text={note.text} />
              </article>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
