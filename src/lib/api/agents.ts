import { queryOptions } from '@tanstack/react-query';
import type { AgentDirectory, AgentReply } from '../../../shared/api';
import { request } from './transport';

export function agentQueryOptions(workspace: string | null) {
  return queryOptions({
    queryKey: ['agents', workspace],
    queryFn: () => request<AgentDirectory>('/agents', workspace),
    refetchInterval: 5000,
  });
}

export function agentReplyQueryOptions(workspace: string | null, id: string, enabled = true) {
  return queryOptions({
    queryKey: ['agent-reply', workspace, id],
    queryFn: () => request<AgentReply>(`/agent-runs/${encodeURIComponent(id)}`, workspace),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}
