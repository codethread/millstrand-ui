import { useId, useRef } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import type { WorkspaceOption } from '../../shared/api';
import { useAgentPromptStore, type PromptTarget } from '../agent-prompt-store';
import { useAgentOptions, useConflictingPromptRuns, usePromptAgent } from '../hooks/use-agents';
import { useDashboardActions, useWorkspaceId } from '../lib/navigation';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

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
  const persistenceError = useAgentPromptStore((s) => s.persistenceError);
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
      <p className="text-foreground">Saved in this browser, separately for each weaver.</p>
      {persistenceError && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {persistenceError}
        </p>
      )}
      {!enabled ? (
        <p className="text-foreground">Connect this weaver to choose an agent.</p>
      ) : query.error ? (
        <div role="alert" className="text-red-700 dark:text-red-300">
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
        <p className="text-foreground">Loading available agents…</p>
      ) : (
        !available && (
          <p role="alert" className="text-red-700 dark:text-red-300">
            {alias} is not available here. Choose an available agent before sending.
          </p>
        )
      )}
    </div>
  );
}

export function PromptAgentButton({ target }: { target: PromptTarget }) {
  const open = useAgentPromptStore((s) => s.open);
  const workspace = useWorkspaceId();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={workspace === null}
      title={workspace === null ? 'Waiting for weaver discovery before prompting' : undefined}
      onClick={(event) => {
        if (workspace) open(target, event.currentTarget, workspace);
      }}
    >
      <MessageSquare />
      Prompt agent
    </Button>
  );
}

export function AgentPromptDialog() {
  const composer = useAgentPromptStore((state) => state.composer);
  const workspace = useWorkspaceId();
  if (composer.kind === 'closed' || workspace === null || composer.workspace !== workspace)
    return null;
  const revisionKey =
    composer.target.kind === 'review-comment'
      ? `:${composer.target.comment.id}:${composer.target.comment.revision}:${composer.target.comment.candidateVersion}`
      : '';
  return (
    <ComposePrompt
      key={`${workspace}:${composer.target.kind}:${composer.target.id}${revisionKey}`}
      workspace={workspace}
    />
  );
}

function ComposePrompt({ workspace }: { workspace: string }) {
  const composer = useAgentPromptStore((state) => state.composer);
  const alias = useAgentPromptStore((state) => state.aliases[workspace] ?? 'tui');
  const edit = useAgentPromptStore((state) => state.edit);
  const close = useAgentPromptStore((state) => state.close);
  const { openAgentRun } = useDashboardActions();
  const options = useAgentOptions(workspace);
  const mutation = usePromptAgent(composer.kind === 'composing' ? composer.target.cardId : '');
  const conflicts = useConflictingPromptRuns(
    composer.kind === 'composing' ? composer.target.id : '',
    composer.kind === 'composing' ? composer.requestId : '',
  );
  const promptId = useId();
  const prompt = useRef<HTMLTextAreaElement>(null);
  if (composer.kind === 'closed') return null;
  const ready =
    options.data?.some((agent) => agent.name === alias) &&
    !options.error &&
    conflicts.data !== undefined &&
    !conflicts.error &&
    conflicts.data.length === 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) close();
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          prompt.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (composer.trigger?.isConnected) {
            event.preventDefault();
            composer.trigger.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Prompt agent</DialogTitle>
          <DialogDescription className="break-words">
            {composer.target.kind === 'card'
              ? `Card ${composer.target.id}`
              : composer.target.kind === 'review'
                ? `Review ${composer.target.id}`
                : `Review ${composer.target.cardId} · comment ${composer.target.comment.id} · revision ${composer.target.comment.revision} · candidate ${composer.target.comment.candidateVersion}`}{' '}
            · {composer.target.title}
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
                ...(composer.target.kind === 'review-comment'
                  ? { targetKind: 'review-comment' as const, comment: composer.target.comment }
                  : composer.target.kind === 'review'
                    ? { targetKind: 'review' as const }
                    : {}),
                alias,
                prompt: composer.prompt,
                requestId: composer.requestId,
              },
              {
                onSuccess: (reply) => {
                  close();
                  openAgentRun(reply.identity, reply.id);
                },
              },
            );
          }}
        >
          <AgentChoice workspace={workspace} enabled disabled={mutation.isPending} />
          {conflicts.error ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              Agent activity could not refresh. Check it before sending a new prompt.{' '}
              <button
                type="button"
                className="underline"
                disabled={conflicts.isFetching}
                onClick={() => {
                  void conflicts.refetch();
                }}
              >
                Retry activity
              </button>
            </p>
          ) : conflicts.isPending ? (
            <p className="text-sm text-foreground">Checking for an active agent run…</p>
          ) : null}
          {!!conflicts.data?.length && (
            <div
              aria-live="polite"
              className="space-y-2 rounded-md border border-border bg-muted p-3 text-sm"
            >
              <p>
                This target already has an active agent run. Wait for it to settle before starting
                another. Prompt agent starts a new run; it cannot message the running agent.
              </p>
              <div className="flex flex-wrap gap-2">
                {conflicts.data.map((run) => (
                  <Button
                    key={run.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => {
                      close();
                      openAgentRun(null, run.id);
                    }}
                  >
                    Open run {run.id}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor={promptId} className="text-sm font-medium">
              What would you like help with?
            </label>
            <Textarea
              ref={prompt}
              id={promptId}
              className="min-h-36"
              value={composer.prompt}
              disabled={mutation.isPending}
              maxLength={12000}
              placeholder="Ask a question or describe the work…"
              onChange={(event) => edit(event.target.value)}
            />
          </div>
          <p className="text-xs text-foreground">
            Starts a new agent run in this weaver when the target is available. Follow its progress
            and reply in Agents.
          </p>
          {mutation.error && (
            <p
              role="alert"
              className="rounded-md border border-destructive p-3 text-sm text-red-700 dark:text-red-300"
            >
              {mutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" disabled={mutation.isPending} onClick={close}>
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
