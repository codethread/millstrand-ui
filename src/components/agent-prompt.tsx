import { useId } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import type { WorkspaceOption } from '../../shared/api';
import { useAgentPromptStore, type PromptTarget } from '../agent-prompt-store';
import { useAgentOptions, usePromptAgent } from '../lib/api';
import { useDashboardNavigation } from '../lib/navigation';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { ErrorNotice } from './issue-parts';

export function WeaverAgentSetting({ workspace }: { workspace: WorkspaceOption }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <AgentChoice workspace={workspace.id} enabled={workspace.status === 'running'} />
    </div>
  );
}

function AgentChoice({
  workspace,
  enabled,
  disabled = false,
}: {
  workspace: string;
  enabled: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const query = useAgentOptions(workspace, enabled);
  const alias = useAgentPromptStore((s) => s.aliases[workspace] ?? 'tui');
  const setAlias = useAgentPromptStore((s) => s.setAlias);
  const available = query.data?.some((agent) => agent.name === alias) ?? false;
  return (
    <div className="space-y-2 text-xs">
      <label htmlFor={id} className="flex flex-wrap items-center gap-2 font-medium">
        Default agent for this weaver
        <select
          id={id}
          className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
          value={alias}
          disabled={disabled || !enabled || !query.data || !!query.error}
          onChange={(event) => setAlias(workspace, event.target.value)}
        >
          {!available && (
            <option value={alias}>
              {alias}
              {query.data ? ' · unavailable' : ''}
            </option>
          )}
          {query.data?.map((agent) => (
            <option key={agent.name} value={agent.name}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-muted-foreground">Saved in this browser, separately for each weaver.</p>
      {!enabled ? (
        <p className="text-muted-foreground">Connect this weaver to choose an agent.</p>
      ) : query.error ? (
        <div role="alert" className="text-destructive">
          Harnesses unavailable: {query.error.message}{' '}
          <button
            className="underline"
            onClick={() => {
              void query.refetch();
            }}
          >
            Retry agents
          </button>
        </div>
      ) : query.isPending ? (
        <p className="text-muted-foreground">Loading available agents…</p>
      ) : (
        !available && (
          <p role="alert" className="text-destructive">
            {alias} is not available here. Choose an available agent before sending.
          </p>
        )
      )}
    </div>
  );
}

export function PromptAgentButton({ target }: { target: PromptTarget }) {
  const open = useAgentPromptStore((s) => s.open);
  const { workspace } = useDashboardNavigation();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={workspace === null}
      title={workspace === null ? 'Waiting for weaver discovery before prompting' : undefined}
      onClick={(event) => open(target, event.currentTarget)}
    >
      <MessageSquare />
      Prompt agent
    </Button>
  );
}

export function AgentPromptDialog() {
  const composer = useAgentPromptStore((s) => s.composer);
  const nav = useDashboardNavigation();
  if (composer.kind === 'closed' || nav.workspace === null) return null;
  return <ComposePrompt key={`${nav.workspace}:${composer.target.id}`} workspace={nav.workspace} />;
}

function ComposePrompt({ workspace }: { workspace: string }) {
  const s = useAgentPromptStore();
  const composer = s.composer;
  const nav = useDashboardNavigation();
  const options = useAgentOptions(workspace);
  const alias = s.aliases[workspace] ?? 'tui';
  const mutation = usePromptAgent(composer.kind === 'composing' ? composer.target.cardId : '');
  const promptId = useId();
  if (composer.kind === 'closed') return null;
  const ready = options.data?.some((agent) => agent.name === alias) && !options.error;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) s.close();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (composer.trigger.isConnected) {
            event.preventDefault();
            composer.trigger.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Prompt agent</DialogTitle>
          <DialogDescription className="break-words">
            {composer.target.id} · {composer.target.title}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || mutation.isPending || !composer.prompt.trim()) return;
            mutation.mutate(
              {
                targetId: composer.target.id,
                alias,
                prompt: composer.prompt,
                requestId: composer.requestId,
              },
              {
                onSuccess: (reply) => {
                  s.track(workspace, reply.id, composer.requestId);
                  s.close();
                  nav.openAgentRun(reply.identity, reply.id);
                },
              },
            );
          }}
        >
          <AgentChoice workspace={workspace} enabled disabled={mutation.isPending} />
          <div className="space-y-2">
            <label htmlFor={promptId} className="text-sm font-medium">
              What would you like help with?
            </label>
            <Textarea
              id={promptId}
              autoFocus
              className="min-h-36"
              value={composer.prompt}
              disabled={mutation.isPending}
              maxLength={12000}
              placeholder="Ask a question or describe the work…"
              onChange={(event) => s.edit(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Starts a new agent run in this weaver. Follow its progress and reply in Agents.
          </p>
          {mutation.error && <ErrorNotice error={mutation.error} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" disabled={mutation.isPending} onClick={s.close}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!ready || !composer.prompt.trim() || mutation.isPending}
            >
              <Send />
              {mutation.isPending ? 'Sending…' : mutation.error ? 'Retry prompt' : 'Send prompt'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
