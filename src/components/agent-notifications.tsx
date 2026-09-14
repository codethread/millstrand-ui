import { useState } from 'react';
import { Bot } from 'lucide-react';
import { useAgentPromptStore } from '../agent-prompt-store';
import { useAgents } from '../lib/api';
import { promptedRuns } from '../lib/agent-notifications';
import { runLabel } from '../lib/agents';
import { useDashboardNavigation } from '../lib/navigation';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export function AgentNotifications() {
  const query = useAgents();
  const nav = useDashboardNavigation();
  const receipts = useAgentPromptStore((s) => s.receipts);
  const [open, setOpen] = useState(false);
  const runs = promptedRuns(query.data?.identities ?? [], receipts[nav.workspace ?? ''] ?? {});
  const active = runs.filter(({ run }) => run.status === 'ready' || run.status === 'running');
  const unread = runs.filter((item) => item.unread);
  const items = [...unread, ...runs.filter((item) => !item.unread)].slice(0, 20);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0 min-[1101px]:order-last"
          aria-label={`Prompted agents: ${active.length} active, ${unread.length} unread completions`}
          title="Your UI prompts in this weaver"
        >
          <Bot />
          <span>{query.error ? '?' : active.length}</span>
          {unread.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70dvh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <h2 className="text-sm font-semibold">Your prompted agents</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          This weaver · prompts sent from this browser.
        </p>
        {query.error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            Refresh interrupted. Showing last known activity.
          </p>
        )}
        {runs.length === 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Open a card and choose Prompt agent to get started.
          </p>
        )}
        <div className="mt-3 space-y-1">
          {items.map(({ identity, run, unread }) => (
            <button
              key={run.id}
              className="w-full rounded-md p-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => {
                setOpen(false);
                nav.openAgentRun(identity, run.id);
              }}
            >
              <span className="flex items-center gap-2 text-xs font-medium">
                {run.alias} · {runLabel(run)}
                {unread && <span className="ml-auto text-primary">New</span>}
              </span>
              <span className="mt-1 block break-words text-xs text-muted-foreground">
                {run.title}
              </span>
            </button>
          ))}
        </div>
        <Button
          className="mt-3 w-full"
          size="sm"
          variant="outline"
          onClick={() => {
            setOpen(false);
            nav.setMode('agents');
          }}
        >
          All agents
        </Button>
      </PopoverContent>
    </Popover>
  );
}
