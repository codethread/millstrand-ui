import { Eye } from 'lucide-react';
import { hiddenWorkspaces } from '../lib/workspaces';
import { useWorkspacePreferenceStore } from '../workspace-preference-store';
import { Button } from './ui/button';

export function WorkspacePreferenceError() {
  const error = useWorkspacePreferenceStore((state) => state.persistenceError);
  return error ? (
    <p role="alert" className="my-2 text-xs text-destructive">
      {error}
    </p>
  ) : null;
}

export function HiddenWorkspaces() {
  const preferences = useWorkspacePreferenceStore((state) => state.preferences);
  const setPreference = useWorkspacePreferenceStore((state) => state.setPreference);
  const hidden = hiddenWorkspaces(preferences);
  if (hidden.length === 0) return null;
  return (
    <section className="mt-8 border-t border-border pt-5" aria-label="Hidden weavers">
      <h2 className="text-sm font-semibold">Hidden weavers · {hidden.length}</h2>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        Hidden in this browser · activity polling paused.
      </p>
      <div className="space-y-2">
        {hidden.map((workspace) => (
          <div
            key={workspace.id}
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <strong className="block text-sm">{workspace.name}</strong>
              <span className="block break-all text-xs text-muted-foreground">
                {workspace.path.replace(/\/\.millstrand$/, '')}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Unhide ${workspace.name}`}
              onClick={() => setPreference(workspace, null)}
            >
              <Eye /> Unhide
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
