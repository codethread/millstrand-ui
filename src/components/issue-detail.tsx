import { useState } from 'react';
import { ArrowUpRight, Check, Clock3, Copy, GitBranch, Layers, Network } from 'lucide-react';
import { Markdown } from './markdown';
import type { CardDetail } from '../../shared/api';
import { PromptAgentButton } from './agent-prompt';
import { useCard } from '../hooks/use-cards';
import { formatDate } from '../lib/board';
import { useDashboardActions, useDetailTab } from '../lib/navigation';
import type { DetailTab } from '../lib/dashboard-search';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { ErrorNotice, Loading, StatusBadge, TypeIcon } from './issue-parts';
import { cn } from '../lib/utils';
import { IssueAgents } from './agent-activity';
import { AutoRunDetails } from './auto-run';
import { Notes, TaskRow } from './issue-tasks';
import { LabelsEditor } from './issue-labels';
import { IssueProperties } from './issue-properties';
import { CardAgentLog } from './card-agent-log';

function DetailOverview({ detail }: { detail: CardDetail }) {
  const { exploreGraph } = useDashboardActions();
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
      <AutoRunDetails autoRun={detail.card.autoRun} />
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
      <LabelsEditor card={detail.card} />
      <IssueProperties card={detail.card} />
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
  const tab = useDetailTab();
  const { closeCard, openCard, exploreGraph, setDetailTab: setTab } = useDashboardActions();
  const detail = query.data;
  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'notes', label: 'Notes' },
    { id: 'agents', label: 'Agents' },
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
                <PromptAgentButton
                  target={{ kind: 'card', cardId: id, id, title: detail.card.title }}
                />
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
                if (
                  value === 'overview' ||
                  value === 'notes' ||
                  value === 'agents' ||
                  value === 'attributes'
                )
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
                      {item.id === 'notes' && <span>{detail.notes.length}</span>}
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
              {query.error && (
                <>
                  <ErrorNotice error={query.error} />
                  <p className="detail-empty">Showing last-known issue details.</p>
                </>
              )}
              <TabsContent value="overview" className="detail-body">
                <DetailOverview detail={detail} />
              </TabsContent>
              <TabsContent value="notes" className="detail-body">
                <Notes notes={detail.notes} />
              </TabsContent>
              <TabsContent value="agents" className="detail-body flex-col data-[state=active]:flex">
                <CardAgentLog owner={detail.card.owner} target={detail.card.id} />
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
