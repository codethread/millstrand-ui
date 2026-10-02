import { queryOptions } from '@tanstack/react-query';
import { logActivitySchema } from '../../../shared/log-activity';
import { request } from './transport';

export function logActivityOptions(workspace: string | null, enabled = true) {
  return queryOptions({
    queryKey: ['log-activity', workspace],
    queryFn: async () =>
      logActivitySchema.parse(await request<unknown>('/log-activity', workspace)),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}
