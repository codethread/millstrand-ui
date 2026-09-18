import { AgentDirectory } from './agent-directory';

/** Workspace Agents page entry. Shared badges, detail, status, and replies live in
 * their page-independent component modules. */
export function AgentsView() {
  return <AgentDirectory />;
}
