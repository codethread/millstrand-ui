import {
  ArrowUpRight,
  EyeOff,
  GitBranch,
  Pin,
  PinOff,
  Play,
  Power,
  RotateCw,
  Settings2,
} from 'lucide-react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { weaverMutationOptions } from '../lib/api/workspaces';
import type { WeaverOperation, WorkspaceOption } from '../../shared/api';
import { useCockpitStore } from '../cockpit-store';
import { useVisibleWorkspaces } from '../hooks/use-visible-workspaces';
import { useDashboardActions } from '../lib/navigation';
import { cn } from '../lib/utils';
import { useWorkspacePreferenceStore } from '../workspace-preference-store';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { HiddenWorkspaces } from './workspace-preferences';

export function WeaverMenu({ workspace }: { workspace: WorkspaceOption }) {
  const pinned = useWorkspacePreferenceStore(
    (state) => state.preferences[workspace.id]?.kind === 'pinned',
  );
  const setPreference = useWorkspacePreferenceStore((state) => state.setPreference);
  const pending = useIsMutating({ mutationKey: ['weaver-lifecycle', workspace.id] }) > 0;
  const setControls = useCockpitStore((state) => state.setControls);
  const { selectWorkspace } = useDashboardActions();
  const running = workspace.status === 'running';
  function confirm(operation: WeaverOperation) {
    setControls({ kind: 'confirm', workspace: workspace.id, operation });
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8 shrink-0 text-muted-foreground"
          disabled={pending}
          aria-label={`Controls for ${workspace.name}`}
        >
          <Settings2 className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{workspace.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => selectWorkspace(workspace.id)}>
          <ArrowUpRight /> Open workspace
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPreference(workspace, pinned ? null : 'pinned')}>
          {pinned ? <PinOff /> : <Pin />} {pinned ? 'Unpin' : 'Pin'} weaver
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPreference(workspace, 'hidden')}>
          <EyeOff /> Hide weaver
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Weaver lifecycle</DropdownMenuLabel>
        <DropdownMenuItem disabled={running} onSelect={() => confirm('start')}>
          <Play /> Start weaver…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!running} onSelect={() => confirm('restart')}>
          <RotateCw /> Restart weaver…
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!running}
          className="text-destructive"
          onSelect={() => confirm('stop')}
        >
          <Power /> Stop weaver…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WeaverLink({ workspace }: { workspace: WorkspaceOption }) {
  const { selectWorkspace } = useDashboardActions();
  const pinned = useWorkspacePreferenceStore(
    (state) => state.preferences[workspace.id]?.kind === 'pinned',
  );
  return (
    <div className="group flex min-w-0 items-center gap-1 rounded-lg hover:bg-accent/60">
      <button
        onClick={() => selectWorkspace(workspace.id)}
        title={workspace.path}
        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left text-xs hover:text-primary"
      >
        <span className={cn('weaver-status', workspace.status)} />
        <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
        {pinned && <Pin className="size-3 shrink-0 text-primary" aria-label="Pinned" />}
      </button>
      <WeaverMenu workspace={workspace} />
    </div>
  );
}

export function WeaverRail({ options }: { options: WorkspaceOption[] }) {
  return (
    <aside
      className="hidden shrink-0 border-r border-border bg-muted/25 px-2 py-5 lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-[190px] lg:overflow-y-auto"
      aria-label="Weaver navigation"
    >
      <div className="mb-7 flex items-center gap-2 px-2 text-base font-semibold tracking-tight">
        <GitBranch className="size-4 text-primary" />
        millstrand.
      </div>
      <div className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        All weavers
      </div>
      <nav aria-label="Workspaces" className="space-y-1">
        {options.map((workspace) => (
          <WeaverLink key={workspace.id} workspace={workspace} />
        ))}
      </nav>
      <p className="mt-5 px-2 text-[10px] leading-relaxed text-muted-foreground">
        Pins first · click to open
        <br />
        Controls under <Settings2 className="inline size-3" />
      </p>
    </aside>
  );
}

export function WeaverFleet({ options }: { options: WorkspaceOption[] }) {
  return (
    <section className="mt-8 border-t border-border pt-5" aria-label="Weaver fleet">
      <h2 className="mb-3 text-sm font-semibold">Weaver fleet</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((workspace) => (
          <div key={workspace.id} className="min-w-0 rounded-lg border border-border bg-card p-1">
            <WeaverLink workspace={workspace} />
          </div>
        ))}
      </div>
      <HiddenWorkspaces />
    </section>
  );
}

function WeaverConfirmation({
  workspace,
  operation,
}: {
  workspace: WorkspaceOption;
  operation: WeaverOperation;
}) {
  const mutation = useMutation(weaverMutationOptions(useQueryClient(), workspace.id));
  const setControls = useCockpitStore((state) => state.setControls);
  return (
    <>
      <p className="break-all text-xs text-muted-foreground">{workspace.path}</p>
      <p className="text-sm">
        {operation === 'stop'
          ? 'This makes the workspace unavailable until its weaver starts again. It does not stop individual agents.'
          : operation === 'restart'
            ? 'This replaces the weaver and temporarily interrupts workspace access. It does not wake quiet agents.'
            : 'This starts the workspace’s weaver through the local mill.'}
      </p>
      {mutation.isPending && (
        <output className="block text-sm">
          Waiting for the local mill. This can take up to five minutes; closing this dialog does not
          cancel the command.
        </output>
      )}
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <output className="block text-sm">
          The mill completed the {operation} command. Discovery reflects the latest known status.
        </output>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => setControls({ kind: 'fleet' })}>
          {mutation.isSuccess ? 'Done' : 'Back to weavers'}
        </Button>
        {!mutation.isSuccess && (
          <Button
            disabled={mutation.isPending}
            variant={operation === 'stop' ? 'destructive' : 'default'}
            onClick={() => mutation.mutate(operation)}
          >
            {mutation.isPending ? 'Working…' : `Confirm ${operation}`}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

export function WeaverControlsDialog() {
  const discovery = useVisibleWorkspaces();
  const options = discovery.data ?? [];
  const controls = useCockpitStore((state) => state.controls);
  const setControls = useCockpitStore((state) => state.setControls);
  const workspace =
    controls.kind === 'confirm' ? options.find((option) => option.id === controls.workspace) : null;
  const close = () => setControls({ kind: 'closed' });
  return (
    <Dialog
      open={controls.kind !== 'closed'}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {controls.kind === 'confirm' && workspace
              ? `Confirm ${controls.operation}: ${workspace.name}`
              : 'All weavers'}
          </DialogTitle>
          <DialogDescription>
            Manage workspace weavers, not individual agent sessions.
          </DialogDescription>
        </DialogHeader>
        {discovery.error && (
          <p role="alert" className="text-sm text-destructive">
            Discovery failed: {discovery.error.message}
          </p>
        )}
        {controls.kind === 'fleet' ? (
          <>
            <div className="max-h-[60dvh] space-y-2 overflow-y-auto">
              {options.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{option.name}</strong>
                    <span className="text-xs text-muted-foreground">{option.status}</span>
                  </div>
                  <WeaverMenu workspace={option} />
                </div>
              ))}
            </div>
            <HiddenWorkspaces />
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : controls.kind === 'confirm' && workspace ? (
          <WeaverConfirmation
            key={`${workspace.id}:${controls.operation}`}
            workspace={workspace}
            operation={controls.operation}
          />
        ) : (
          <p className="text-sm">
            This weaver is no longer visible. Close this dialog and refresh discovery.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
