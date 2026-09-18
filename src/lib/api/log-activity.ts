import { queryOptions } from '@tanstack/react-query';
import { logActivitySchema } from '../../../shared/log-activity';
import { request } from './transport';

export function logActivityOptions(workspace: string | null) {
  return queryOptions({
    queryKey: ['log-activity', workspace],
    queryFn: async () =>
      logActivitySchema.parse(await request<unknown>('/log-lab/activity', workspace)),
    refetchInterval: 5000,
  });
}
