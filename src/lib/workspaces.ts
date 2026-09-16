import type { WorkspaceOption } from '../../shared/api';

export function selectedWorkspace(
  options: WorkspaceOption[],
  workspaceId: string | null,
  fallbackPath: string | null,
): WorkspaceOption | null {
  return (
    options.find((option) =>
      workspaceId ? option.id === workspaceId : option.path === fallbackPath,
    ) ?? null
  );
}

export function matchingWorkspaces(options: WorkspaceOption[], search: string): WorkspaceOption[] {
  if (!search) return options;
  const term = search.toLowerCase();
  return options.filter((option) => `${option.name} ${option.path}`.toLowerCase().includes(term));
}
