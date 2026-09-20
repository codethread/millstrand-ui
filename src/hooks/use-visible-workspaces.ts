import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WorkspaceOption } from '../../shared/api';
import { workspaceReaderOptions } from '../lib/api/workspaces';
import { visibleWorkspaces } from '../lib/workspaces';
import { useWorkspacePreferenceStore } from '../workspace-preference-store';

/** Shared discovery projection for both lists and all overview activity poll owners. */
export function useVisibleWorkspaces() {
  const preferences = useWorkspacePreferenceStore((state) => state.preferences);
  const select = useCallback(
    (options: WorkspaceOption[]) => visibleWorkspaces(options, preferences),
    [preferences],
  );
  return useQuery({ ...workspaceReaderOptions(), select });
}
