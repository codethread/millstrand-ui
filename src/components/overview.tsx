import { useAttentionStore } from '../attention-store';
import { Filter, GitBranch, RefreshCw, Settings2 } from 'lucide-react';
import { useCockpitStore, type CockpitSection } from '../cockpit-store';
import { useCockpit } from '../hooks/use-cockpit';
import {
  useSelectedAgent,
  useSelectedAgentRun,
  useSelectedIssue,
  useWorkspaceId,
} from '../lib/navigation';
import type { WorkspaceActivityModel } from '../lib/overview';
import { cn } from '../lib/utils';
import { ActivityRail, AttentionCentre } from './cockpit-work';
import { WeaverControlsDialog, WeaverFleet, WeaverRail } from './cockpit-weavers';
import { AgentDetail } from './agent-detail';
import { AgentPromptDialog } from './agent-prompt';
import { IssueDetail } from './issue-detail';
import { ErrorNotice, Loading } from './issue-parts';
import { OverviewLogPolls } from './overview-log-polls';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { WorkspacePreferenceError } from './workspace-preferences';
import { WorkspaceSwitcher } from './workspace-switcher';

const sections: { id: CockpitSection; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'review', label: 'Ready for a look' },
  { id: 'quiet', label: 'Running, but quiet' },
];

function SourceNotice({ snapshot }: { snapshot: WorkspaceActivityModel }) {
  const messages = [
    ...(snapshot.workspace.status !== 'running'
      ? ['Weaver offline. Any retained work is last known.']
      : []),
    ...(snapshot.board.health.kind === 'failed'
      ? [`Kanban unavailable: ${snapshot.board.health.message}`]
      : []),
    ...(snapshot.agents.health.kind === 'failed'
      ? [`Agent data unavailable: ${snapshot.agents.health.message}`]
      : []),
  ];
  return messages.length ? (
    <details className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-destructive">
      <summary className="cursor-pointer">
        {snapshot.workspace.name} ·{' '}
        {snapshot.workspace.status !== 'running' ? 'offline' : 'some data unavailable'}
      </summary>
      <p className="mt-2 break-words">{messages.join(' ')}</p>
    </details>
  ) : null;
}

export function Overview() {
  const cockpit = useCockpit();
  const { options, snapshots, work, discoveryHealth, refreshAll } = cockpit;
  const search = useCockpitStore((state) => state.search);
  const setSearch = useCockpitStore((state) => state.setSearch);
  const scope = useCockpitStore((state) => state.scope);
  const setScope = useCockpitStore((state) => state.setScope);
  const section = useCockpitStore((state) => state.section);
  const setSection = useCockpitStore((state) => state.setSection);
  const setControls = useCockpitStore((state) => state.setControls);
  const attentionError = useAttentionStore((state) => state.loadError);
  const workspace = useWorkspaceId();
  const issue = useSelectedIssue();
  const agent = useSelectedAgent();
  const agentRun = useSelectedAgentRun();
  const inspectable = options.some(
    (option) => option.id === workspace && option.status === 'running',
  );
  const filtered = section !== 'all' || scope !== null;
  return (
    <div className="flex min-h-dvh items-start bg-muted/15">
      <OverviewLogPolls />
      <WeaverRail options={options} />
      <main className="min-w-0 flex-1 p-4 sm:p-6" aria-label="All weavers cockpit">
        <header className="mb-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="flex items-center gap-2 text-xl! font-semibold tracking-tight">
              <GitBranch className="size-5 text-primary lg:hidden" />
              All weavers
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="fleet-search"
              aria-label="Search the fleet"
              placeholder="Search the fleet…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 min-w-24 flex-1 bg-card sm:max-w-80"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('h-9', filtered && 'border-primary text-primary')}
                >
                  <Filter />
                  Filters{filtered ? ' · on' : ''}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="space-y-4">
                <label className="block text-xs font-medium">
                  Workspace
                  <select
                    aria-label="Filter workspace"
                    value={scope ?? ''}
                    onChange={(event) => setScope(event.target.value || null)}
                    className="mt-2 block h-9 w-full rounded-md border border-input bg-background px-2"
                  >
                    <option value="">All visible weavers</option>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <p className="mb-2 text-xs font-medium">Show in the centre</p>
                  <div className="flex flex-col gap-1">
                    {sections.map((item) => (
                      <Button
                        key={item.id}
                        variant={section === item.id ? 'secondary' : 'ghost'}
                        size="sm"
                        className="justify-start"
                        aria-pressed={section === item.id}
                        onClick={() => setSection(item.id)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setScope(null);
                    setSection('all');
                  }}
                >
                  Clear filters
                </Button>
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setControls({ kind: 'fleet' })}
            >
              <Settings2 />
              Weavers
            </Button>
            <Button variant="ghost" size="icon" onClick={refreshAll} aria-label="Refresh all">
              <RefreshCw className="size-4" />
            </Button>
          </div>
          <div className="lg:hidden [&_.workspace-picker]:m-0 [&_.workspace-picker]:w-full">
            <WorkspaceSwitcher workspace={null} />
          </div>
        </header>
        <WorkspacePreferenceError />
        {attentionError && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {attentionError}
          </p>
        )}
        {discoveryHealth.kind === 'failed' && <ErrorNotice error={discoveryHealth.error} />}
        {discoveryHealth.kind === 'loading' && <Loading text="Discovering weavers…" />}
        {cockpit.activity.partial && (
          <p className="mb-4 text-xs text-destructive">
            Some sources are loading or unavailable. Available work is shown; see source status
            below.
          </p>
        )}
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_270px]">
          <div className="min-w-0">
            <AttentionCentre
              attention={work.attention}
              review={work.review}
              quiet={work.quiet}
              section={section}
              partial={cockpit.activity.partial}
            />
            <div className="mt-5 space-y-2">
              {snapshots.map((snapshot) => (
                <SourceNotice key={snapshot.workspace.id} snapshot={snapshot} />
              ))}
            </div>
          </div>
          <ActivityRail agents={work.agents} />
          <div className="min-w-0 xl:col-start-1">
            <WeaverFleet options={options} />
          </div>
        </div>
      </main>
      {inspectable && issue && <IssueDetail key={`${workspace}:${issue}`} id={issue} />}
      {inspectable && (agent || agentRun) && (
        <AgentDetail
          key={`${workspace}:${agent ?? ''}:${agentRun ?? ''}`}
          identityId={agent}
          runId={agentRun}
        />
      )}
      <AgentPromptDialog />
      <WeaverControlsDialog />
    </div>
  );
}
