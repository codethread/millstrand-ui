import type { WorkspaceOption } from '../../shared/api';
import { sorted } from '../../shared/array';

export interface WorkspacePreference {
  kind: 'pinned' | 'hidden';
  name: string;
  path: string;
}
export type WorkspacePreferences = Record<string, WorkspacePreference>;

/** Hidden entries never reach list readers or overview poll owners. Stable within each group. */
export function visibleWorkspaces(
  options: WorkspaceOption[],
  preferences: WorkspacePreferences,
): WorkspaceOption[] {
  return sorted(
    options.filter((option) => preferences[option.id]?.kind !== 'hidden'),
    (a, b) =>
      Number(preferences[b.id]?.kind === 'pinned') - Number(preferences[a.id]?.kind === 'pinned'),
  );
}

export function hiddenWorkspaces(preferences: WorkspacePreferences) {
  return sorted(
    Object.entries(preferences)
      .filter(([, preference]) => preference.kind === 'hidden')
      .map(([id, preference]) => ({ id, name: preference.name, path: preference.path })),
    (a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path),
  );
}

/** An unscoped legacy URL must not fetch a possibly hidden server default. */
export function workspaceIsHidden(
  workspace: string | null,
  preferences: WorkspacePreferences,
): boolean {
  return workspace === null
    ? Object.values(preferences).some((preference) => preference.kind === 'hidden')
    : preferences[workspace]?.kind === 'hidden';
}

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
