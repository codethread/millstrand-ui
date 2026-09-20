import { Check, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { CardLogAgent } from '../lib/agent-logs';
import { cardLogAgentContext, cardLogAgentStatus } from '../lib/agent-logs';
import { useDashboardActions } from '../lib/navigation';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export function CardAgentRoster({
  agents,
  selected,
  choose,
  historyCount,
  showHistory,
  setShowHistory,
}: {
  agents: CardLogAgent[];
  selected: CardLogAgent;
  choose: (identity: string) => void;
  historyCount: number;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
}) {
  const { openAgentRun } = useDashboardActions();
  const current = agents.filter((agent) => agent.group === 'current');
  const history = agents.filter((agent) => agent.group === 'history');
  const row = (agent: CardLogAgent) => (
    <li key={agent.identity.strandId} className="flex items-center gap-1">
      <Button
        variant="ghost"
        className={cn(
          'h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-2 text-left whitespace-normal',
          selected.identity.strandId === agent.identity.strandId &&
            'bg-accent text-accent-foreground',
        )}
        aria-pressed={selected.identity.strandId === agent.identity.strandId}
        onClick={() => choose(agent.identity.strandId)}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {selected.identity.strandId === agent.identity.strandId && <Check className="size-3!" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium">
            {agent.identity.id}
            <span className="ml-2 font-normal text-muted-foreground">
              {' · '}
              {agent.run?.alias ?? agent.identity.harness}
            </span>
          </span>
          <span
            className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground"
            title={cardLogAgentContext(agent)}
          >
            {cardLogAgentContext(agent)}
          </span>
        </span>
        <span className="shrink-0 text-[9px] font-normal text-muted-foreground">
          {cardLogAgentStatus(agent)}
        </span>
      </Button>
      {agent.run !== null && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7 shrink-0"
          aria-label={`Inspect run ${agent.run.id}`}
          title="Inspect this exact run"
          onClick={() => openAgentRun(agent.identity.id, agent.run!.id)}
        >
          <ExternalLink className="size-3!" />
        </Button>
      )}
    </li>
  );
  return (
    <div className="shrink-0 bg-muted/30">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-[10px] font-medium text-muted-foreground">Card participation</span>
        {historyCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            aria-expanded={showHistory}
            onClick={() => setShowHistory(!showHistory)}
          >
            Past participation ({historyCount})
            {showHistory ? <ChevronUp className="size-3!" /> : <ChevronDown className="size-3!" />}
          </Button>
        )}
      </div>
      <ul
        aria-label="Current card participants"
        className="hidden max-h-[min(14rem,30vh)] overflow-y-auto px-2 pb-2 sm:block"
      >
        {current.length > 0 && (
          <li className="px-2 pb-1 text-[10px] font-medium text-muted-foreground">
            Current participation
          </li>
        )}
        {current.map(row)}
        {history.length > 0 && (
          <li className="px-2 pt-2 pb-1 text-[10px] font-medium text-muted-foreground">
            Past participation
          </li>
        )}
        {history.map(row)}
      </ul>
      <div className="px-3 pb-2 sm:hidden">
        <select
          aria-label="Activity agent"
          className="w-full min-w-0 rounded border border-border bg-background p-2 text-xs text-foreground"
          value={selected.identity.strandId}
          onChange={(event) => choose(event.target.value)}
        >
          {agents.map((agent) => (
            <option key={agent.identity.strandId} value={agent.identity.strandId}>
              {agent.group === 'current' ? 'Current' : 'Past'} · {agent.identity.id} ·{' '}
              {cardLogAgentContext(agent)} · {cardLogAgentStatus(agent)}
            </option>
          ))}
        </select>
        <p
          className="mt-2 line-clamp-2 text-[10px] text-muted-foreground"
          title={cardLogAgentContext(selected)}
        >
          {cardLogAgentContext(selected)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[9px] text-muted-foreground">
        <p>
          {selected.relation === 'target'
            ? 'Explicitly linked run · ownership remains separate'
            : 'Ownership only · activity on this work is not confirmed'}
        </p>
        {selected.tasks.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-[10px]">
                Tasks ({selected.tasks.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="max-h-64 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
            >
              <h3 className="mb-2 text-xs font-medium">Tasks linked to {selected.identity.id}</h3>
              <ul className="space-y-3">
                {selected.tasks.map((task) => (
                  <li key={task.id} className="text-xs">
                    <p>{task.title}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {task.id} ·{' '}
                      {task.owner === selected.identity.id ? 'Task owner' : 'Linked run'} ·{' '}
                      {task.state === 'closed' ? 'Completed' : task.state}
                    </p>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
