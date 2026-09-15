import { ArrowLeft, ArrowUpRight, Bot, CheckCheck, GitPullRequest, Search, X } from 'lucide-react';
import { reviewStages, type ReviewDetail, type ReviewSummary } from '../../shared/reviews';
import { useAgents, useReview, useReviews } from '../lib/api';
import { formatDate } from '../lib/board';
import { useDashboardNavigation } from '../lib/navigation';
import { reviewInInbox, reviewLabel, reviewPromptTarget, selectReviews } from '../lib/reviews';
import { cn } from '../lib/utils';
import { Markdown } from './issue-detail';
import { PromptAgentButton } from './agent-prompt';
import { ErrorNotice, Loading } from './issue-parts';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function ReviewSearchControls() {
  const nav = useDashboardNavigation();
  return (
    <div className="toolbar-actions">
      <div className="search-field">
        <Search />
        <Input
          id="review-search"
          aria-label="Search reviews"
          placeholder="MR, repository, reviewer…"
          value={nav.reviewQuery}
          onChange={(event) => nav.setReviewQuery(event.target.value)}
        />
        {nav.reviewQuery && (
          <button aria-label="Clear review search" onClick={() => nav.setReviewQuery('')}>
            <X className="size-3" />
          </button>
        )}
      </div>
      <select
        aria-label="Review stage"
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        value={nav.reviewStage ?? ''}
        onChange={(event) =>
          nav.setReviewStage(reviewStages.find((stage) => stage === event.target.value) ?? null)
        }
      >
        <option value="">Every stage</option>
        {reviewStages.map((stage) => (
          <option key={stage} value={stage}>
            {stage === 'reviewed'
              ? 'Ready to read'
              : stage.charAt(0).toUpperCase() + stage.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}
function ReviewStatus({ review }: { review: ReviewSummary }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-medium',
        review.stage === 'reviewed' &&
          review.decision === 'pending' &&
          'border-emerald-200 bg-emerald-50 text-emerald-800',
        review.stage === 'failed' && 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      {reviewLabel(review)}
    </span>
  );
}
function ReviewEvidence({ detail }: { detail: ReviewDetail }) {
  const promptTarget = reviewPromptTarget(detail);
  const nav = useDashboardNavigation();
  const agents = useAgents();
  return (
    <>
      <section className="border-b border-border p-5 md:p-7">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ReviewStatus review={detail} />
          <span
            className={cn('text-xs', detail.current ? 'text-muted-foreground' : 'text-amber-700')}
          >
            {detail.current ? 'Current at last poll' : 'Outdated at last poll'}
          </span>
          <code className="ml-auto text-[10px] text-muted-foreground">{detail.id}</code>
        </div>
        <h2 className="break-words text-xl font-semibold tracking-tight">
          {detail.mr.title ?? detail.title}
        </h2>
        {promptTarget && (
          <div className="mt-3">
            <PromptAgentButton target={promptTarget} />
          </div>
        )}
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
        {!detail.current && (
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
            This revision was no longer current or open in the last successful poll. Its evidence is
            preserved.{detail.decision === 'pending' && ' It still awaits a local decision.'}
          </p>
        )}
      </section>
      <section className="p-5 md:p-7" aria-label="Review report">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <CheckCheck className="size-4 text-primary" />
          Review report
        </h3>
        {detail.report ? (
          <Markdown text={detail.report} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {detail.stage === 'failed'
              ? 'No final report was produced. Inspect the reviewer evidence below.'
              : 'The final report will appear here when it is ready.'}
          </p>
        )}
      </section>
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
            const identity = agents.data?.identities.find((agent) =>
              agent.runs.some((run) => run.id === seat.runId),
            );
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
                  {seat.runId && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <code className="break-all text-muted-foreground">Run {seat.runId}</code>
                      {identity && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (seat.runId) nav.openAgentRun(identity.id, seat.runId);
                          }}
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
        <section className="border-t border-border p-5 md:p-7">
          <h3 className="mb-3 text-sm font-semibold">Related work</h3>
          <div className="flex flex-wrap gap-2">
            {detail.links.map((link) => (
              <span
                key={`${link.type}:${link.id}`}
                className="rounded-md border border-border px-3 py-2 text-xs"
              >
                {link.title} <code className="text-muted-foreground">{link.id}</code> · {link.type}
              </span>
            ))}
          </div>
        </section>
      )}
      {detail.history.length > 0 && (
        <section className="border-t border-border p-5 md:p-7">
          <h3 className="mb-3 text-sm font-semibold">Review history</h3>
          <div className="space-y-2">
            {detail.history.map((review) => (
              <button
                key={review.id}
                className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border p-3 text-left text-xs hover:bg-muted"
                onClick={() => nav.openReview(review.id)}
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
function SelectedReview({ id }: { id: string }) {
  const query = useReview(id);
  const nav = useDashboardNavigation();
  return (
    <article className="min-w-0 flex-1 overflow-y-auto bg-background" aria-label="Selected review">
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-background/95 px-4 py-2">
        <Button variant="ghost" size="sm" onClick={nav.closeReview}>
          <ArrowLeft />
          Back to reviews
        </Button>
      </div>
      {query.error && (
        <div className="p-4">
          <ErrorNotice error={query.error} />
          {query.data && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the last successful review. Refresh failed.
            </p>
          )}
          <Button className="mt-2" variant="outline" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {query.data ? (
        <ReviewEvidence detail={query.data} />
      ) : (
        !query.error && <Loading text="Loading review evidence…" />
      )}
    </article>
  );
}
export function ReviewsView() {
  const query = useReviews();
  const nav = useDashboardNavigation();
  const data = query.data;
  if (!data && query.error)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="p-5">
          <ErrorNotice error={query.error} />
          <Button className="mt-3" variant="outline" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
        {nav.review && <SelectedReview key={nav.review} id={nav.review} />}
      </div>
    );
  if (data?.kind === 'unsupported')
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <GitPullRequest className="size-8 text-muted-foreground" />
        <h2 className="font-semibold">Reviews are not configured</h2>
        <p className="max-w-lg text-sm text-muted-foreground">{data.message}</p>
      </div>
    );
  const all = data?.kind === 'available' ? data.reviews : [];
  const reviews = selectReviews(all, nav.reviewScope, nav.reviewStage, nav.reviewQuery);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {query.error && (
        <div className="border-b border-border p-3">
          <ErrorNotice error={query.error} />
          {data && (
            <p className="mt-1 text-xs text-muted-foreground">Showing last known reviews.</p>
          )}
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {!data && !query.error ? (
        <Loading text="Loading reviews…" />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              'flex min-h-0 w-full shrink-0 flex-col border-r border-border md:w-80 lg:w-96',
              nav.review && 'hidden md:flex',
            )}
          >
            <div className="flex items-center gap-2 border-b border-border p-3">
              {(['inbox', 'all'] as const).map((scope) => (
                <button
                  key={scope}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium',
                    nav.reviewScope === scope
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                  aria-pressed={nav.reviewScope === scope}
                  onClick={() => nav.setReviewScope(scope)}
                >
                  {scope === 'inbox' ? 'Inbox' : 'All reviews'}{' '}
                  <span className="ml-1 opacity-70">
                    {scope === 'inbox' ? all.filter(reviewInInbox).length : all.length}
                  </span>
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {reviews.map((review) => (
                <button
                  key={review.id}
                  onClick={() => nav.openReview(review.id)}
                  aria-pressed={nav.review === review.id}
                  className={cn(
                    'block w-full border-b border-border p-4 text-left hover:bg-muted/50',
                    nav.review === review.id && 'bg-muted',
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <ReviewStatus review={review} />
                    {!review.current && (
                      <span className="text-[10px] text-amber-700">Outdated</span>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {review.mr.iid !== null ? `!${review.mr.iid}` : review.id}
                    </span>
                  </div>
                  <h3 className="break-words text-sm leading-5 font-medium">
                    {review.mr.title ?? review.title}
                  </h3>
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    {review.repo ?? 'Repository unavailable'}
                  </p>
                  <div className="mt-3 flex gap-2 text-[10px] text-muted-foreground">
                    <span>{review.reviewers.length} reviewers</span>
                    <span>· {formatDate(review.createdAt)}</span>
                    {review.reportAvailable && (
                      <CheckCheck className="ml-auto size-3.5 text-emerald-600" />
                    )}
                  </div>
                </button>
              ))}
              {reviews.length === 0 && (
                <div className="p-7 text-center">
                  <GitPullRequest className="mx-auto mb-3 size-7 text-muted-foreground" />
                  <h3 className="text-sm font-medium">
                    {nav.reviewQuery || nav.reviewStage
                      ? 'No matching reviews'
                      : nav.reviewScope === 'inbox'
                        ? 'Your review inbox is clear'
                        : 'No reviews yet'}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {nav.reviewQuery || nav.reviewStage
                      ? 'Try another search or stage.'
                      : nav.reviewScope === 'inbox'
                        ? 'Reviews awaiting a local decision appear here, including outdated revisions. Browse all reviews for completed and older revisions.'
                        : 'Reviews created through strand will appear here.'}
                  </p>
                </div>
              )}
            </div>
          </div>
          {nav.review ? (
            <SelectedReview key={nav.review} id={nav.review} />
          ) : (
            <div className="hidden min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center md:flex">
              <GitPullRequest className="size-9 text-muted-foreground/60" />
              <h2 className="font-medium">A clear view of every review</h2>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Select a review to read its report, compare revisions, and inspect each reviewer’s
                evidence.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
