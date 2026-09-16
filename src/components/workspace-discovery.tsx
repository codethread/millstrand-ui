import { useQuery } from '@tanstack/react-query';
import { workspaceQueryOptions } from '../lib/api/workspaces';

/** The app's single discovery poll owner; all surfaces subscribe to this cache. */
export function WorkspaceDiscovery() {
  useQuery(workspaceQueryOptions());
  return null;
}
