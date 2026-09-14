import { useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  GitBranch,
  Layers,
  MessageSquare,
  Network,
  Plus,
  Tag,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CardDetail, Note, Task } from '../../shared/api';
import { PromptAgentButton } from './agent-prompt';
import { useCard, useLabels, useTaskNotes } from '../lib/api';
import { formatDate, relativeTime } from '../lib/board';
import { useDashboardNavigation } from '../lib/navigation';
import type { DetailTab } from '../lib/dashboard-search';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { ErrorNotice, LabelPill, Loading, StatusBadge, StatusIcon, TypeIcon } from './issue-parts';
import { cn } from '../lib/utils';
import { IssueAgents } from './agents-view';

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function Notes({ notes }: { notes: Note[] }) {
  return notes.length ? (
    <div className="notes-timeline">
      {notes.map((note) => (
        <article className="note" key={note.id}>
          <span className="note-marker">
            <MessageSquare className="size-3" />
          </span>
          <header>
            <strong>{note.by ?? 'Workspace note'}</strong>
            {note.kind && <span className="note-kind">{note.kind}</span>}
            <time title={note.at}>{relativeTime(note.at)}</time>
          </header>
          <Markdown text={note.text} />
          {note.truncated && (
            <p className="text-xs text-muted-foreground">This note was truncated at the source.</p>
          )}
        </article>
      ))}
    </div>
  ) : (
    <p className="detail-empty">No notes yet. Updates from agents will appear here.</p>
  );
}

function TaskRow({ task, cardId }: { task: Task; cardId: string }) {
  const [open, setOpen] = useState(false);
  const notes = useTaskNotes(cardId, task.id, open);
  return (
    <div className="task-item">
      <button className="task-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <StatusIcon status={task.status} />
        <span>
          <strong>{task.title}</strong>
          <small>
            <span className="issue-id">{task.id}</span>
            <span className={cn('task-status', `status-${task.status}`)}>
              {task.status === 'closed' ? 'completed' : task.status}
            </span>
            {task.owner && <span>{task.owner}</span>}
          </small>
        </span>
        <ChevronDown
          className={cn(
            'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="task-expanded">
          <div className="mb-4">
            <IssueAgents owner={task.owner} target={task.id} />
          </div>
          {task.body ? (
            <Markdown text={task.body} />
          ) : (
            <p className="detail-empty">No task description.</p>
          )}
          <h4 className="detail-section-title">Task activity</h4>
          {notes.isPending ? (
            <Loading text="Loading notes…" />
          ) : notes.error ? (
            <ErrorNotice error={notes.error} />
          ) : (
            <Notes notes={notes.data} />
          )}
        </div>
      )}
    </div>
  );
}

function LabelsEditor({ detail }: { detail: CardDetail }) {
  const mutation = useLabels(detail.card.id);
  function addLabels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get('labels') ?? '');
    const labels = value
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean);
    if (labels.length)
      mutation.mutate({ action: 'add', labels }, { onSuccess: () => form.reset() });
  }
  return (
    <section className="detail-labels">
      <div className="detail-section-title">
        <Tag className="size-3.5" />
        Labels<span className="editable-tag">Editable</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {detail.card.labels.map((label) => (
          <span className="editable-label" key={label}>
            <LabelPill label={label} />
            <button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ action: 'remove', labels: [label] })}
              aria-label={`Remove label ${label}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={addLabels} className="label-form">
        <Input
          name="labels"
          aria-label="New labels"
          placeholder="Add a label…"
          disabled={mutation.isPending}
          autoComplete="off"
        />
        <Button type="submit" variant="outline" size="sm" disabled={mutation.isPending}>
          <Plus />
          Add
        </Button>
      </form>
      <p className="input-hint">Lowercase slugs; separate multiple labels with commas.</p>
      {mutation.error && <ErrorNotice error={mutation.error} />}
    </section>
  );
}

function DetailOverview({ detail }: { detail: CardDetail }) {
  const { openCard, exploreGraph } = useDashboardNavigation();
  const completed = detail.tasks.filter((task) => task.status === 'closed').length;
  return (
    <>
      <section className="detail-section">
        <h3 className="detail-section-title">Description</h3>
        {detail.body ? (
          <Markdown text={detail.body} />
        ) : (
          <p className="detail-empty">No description has been added to this issue.</p>
        )}
      </section>
      <section className="detail-section">
        <div className="flex items-center justify-between">
          <h3 className="detail-section-title">
            <Layers className="size-3.5" />
            Tasks <span className="column-count">{detail.tasks.length}</span>
          </h3>
          <button className="text-action" onClick={() => exploreGraph(detail.card.id)}>
            <Network className="size-3.5" />
            Explore graph
            <ArrowUpRight className="size-3" />
          </button>
        </div>
        {detail.tasks.length > 0 ? (
          <>
            <div className="task-progress">
              <span>
                <span style={{ width: `${(completed / detail.tasks.length) * 100}%` }} />
              </span>
              <small>
                {completed} of {detail.tasks.length} completed
              </small>
            </div>
            <div className="task-list">
              {detail.tasks.map((task) => (
                <TaskRow key={task.id} task={task} cardId={detail.card.id} />
              ))}
            </div>
          </>
        ) : (
          <p className="detail-empty">No tasks yet.</p>
        )}
      </section>
      {detail.related.length > 0 && (
        <section className="detail-section">
          <h3 className="detail-section-title">
            <GitBranch className="size-3.5" />
            Dependencies
          </h3>
          {detail.related.map((relation) => (
            <div className="relation-row" key={`${relation.kind}-${relation.item.id}`}>
              <span>{relation.kind === 'depends-on' ? 'Depends on' : 'Required by'}</span>
              <span className="issue-id">{relation.item.id}</span>
              <span>{relation.item.title}</span>
              <span className="text-xs text-muted-foreground">{relation.item.state}</span>
            </div>
          ))}
        </section>
      )}
      {detail.activeWork.length > 0 && (
        <section className="detail-section">
          <h3 className="detail-section-title">
            <CircleWork />
            Active work <span className="column-count">{detail.activeWork.length}</span>
          </h3>
          {detail.activeWork.map((item) => (
            <div className="relation-row" key={item.id}>
              <span className="live-dot" />
              <span className="issue-id">{item.id}</span>
              <span>{item.title}</span>
            </div>
          ))}
        </section>
      )}
      <LabelsEditor detail={detail} />
      <section className="detail-section">
        <h3 className="detail-section-title">Properties</h3>
        <dl className="property-list">
          {detail.card.epicId && (
            <>
              <dt>Parent epic</dt>
              <dd>
                <button className="text-action" onClick={() => openCard(detail.card.epicId!)}>
                  <Layers className="size-3.5" />
                  {detail.card.epicId}
                  <ArrowUpRight className="size-3" />
                </button>
              </dd>
            </>
          )}
          {detail.card.branch && (
            <>
              <dt>Branch</dt>
              <dd>
                <GitBranch className="size-3.5" />
                {detail.card.branch}
              </dd>
            </>
          )}
          {detail.card.worktree && (
            <>
              <dt>Worktree</dt>
              <dd className="font-mono text-xs">{detail.card.worktree}</dd>
            </>
          )}
          {detail.card.source && (
            <>
              <dt>Source</dt>
              <dd>{detail.card.source}</dd>
            </>
          )}
          {detail.card.outcome && (
            <>
              <dt>Outcome</dt>
              <dd>{detail.card.outcome}</dd>
            </>
          )}
          <dt>Created</dt>
          <dd>{formatDate(detail.card.createdAt)}</dd>
          <dt>Updated</dt>
          <dd>{formatDate(detail.card.updatedAt)}</dd>
        </dl>
      </section>
    </>
  );
}

function CircleWork() {
  return <span className="live-dot" />;
}

function CopyLink() {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const url = window.location.href;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('manual');
    }
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void copy();
        }}
      >
        {state === 'copied' ? <Check /> : <Copy />}
        {state === 'copied' ? 'Copied link' : 'Copy link'}
      </Button>
      {state === 'manual' && (
        <Input
          aria-label="Issue link to copy"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
        />
      )}
    </div>
  );
}

export function IssueDetail({ id }: { id: string }) {
  const query = useCard(id);
  const {
    closeCard,
    openCard,
    exploreGraph,
    detailTab: tab,
    setDetailTab: setTab,
  } = useDashboardNavigation();
  const detail = query.data;
  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity' },
    { id: 'attributes', label: 'Attributes' },
  ];
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) closeCard();
      }}
    >
      <SheetContent className="issue-sheet sm:max-w-[710px]">
        <div className="detail-topline">
          <span className="flex items-center gap-2">
            {detail && <TypeIcon type={detail.card.type} />}
            <span className="issue-id">{id}</span>
            {detail?.card.epicId && (
              <>
                <span className="text-muted-foreground">/</span>
                <button className="parent-crumb" onClick={() => openCard(detail.card.epicId!)}>
                  <Layers className="size-3" />
                  {detail.card.epicId}
                </button>
              </>
            )}
          </span>
          <CopyLink />
        </div>
        {detail ? (
          <>
            <div className="detail-heading">
              <SheetTitle>{detail.card.title}</SheetTitle>
              <SheetDescription className="sr-only">
                Issue details for {detail.card.title}
              </SheetDescription>
              <div className="detail-meta">
                <PromptAgentButton target={{ cardId: id, id, title: detail.card.title }} />
                <StatusBadge status={detail.card.lane} />
                <span className="detail-meta-separator" />
                <IssueAgents owner={detail.card.owner} target={detail.card.id} />
                <span className="detail-meta-separator" />
                <span className={`priority priority-${detail.card.priority}`}>
                  {detail.card.priority.toUpperCase()} priority
                </span>
              </div>
            </div>
            <Tabs
              value={tab}
              className="detail-tabs-root"
              onValueChange={(value) => {
                if (value === 'overview' || value === 'activity' || value === 'attributes')
                  setTab(value);
              }}
            >
              <div className="detail-tabs">
                <TabsList className="detail-tab-list" aria-label="Issue information">
                  {tabs.map((item) => (
                    <TabsTrigger
                      value={item.id}
                      key={item.id}
                      className={cn(tab === item.id && 'selected')}
                    >
                      {item.label}
                      {item.id === 'activity' && <span>{detail.notes.length}</span>}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <button
                  className="ml-auto!"
                  onClick={() => exploreGraph(id)}
                  title="Explore issue graph"
                >
                  <Network className="size-4" />
                </button>
              </div>
              {query.error && <ErrorNotice error={query.error} />}
              <TabsContent value="overview" className="detail-body">
                <DetailOverview detail={detail} />
              </TabsContent>
              <TabsContent value="activity" className="detail-body">
                <Notes notes={detail.notes} />
              </TabsContent>
              <TabsContent value="attributes" className="detail-body">
                <p className="mb-4 text-sm text-muted-foreground">
                  The underlying strand attributes, exactly as recorded.
                </p>
                <pre className="raw-attributes">{JSON.stringify(detail.attributes, null, 2)}</pre>
              </TabsContent>
            </Tabs>
            <div className="detail-footer">
              <Clock3 className="size-3.5" />
              Created {formatDate(detail.card.createdAt)}
              <span className="ml-auto">Read-only issue · editable labels</span>
            </div>
          </>
        ) : (
          <>
            <SheetTitle className="sr-only">Issue {id}</SheetTitle>
            <SheetDescription className="sr-only">Loading issue details</SheetDescription>
            {query.error ? (
              <div className="p-6">
                <ErrorNotice error={query.error} />
                <Button
                  variant="outline"
                  onClick={() => {
                    void query.refetch();
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <Loading text="Opening issue…" />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
