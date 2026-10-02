import { useLogActivityPoll } from '../hooks/use-log-activity';
import { useAgentsPoll } from '../hooks/use-agents';
import { useBoardPoll } from '../hooks/use-cards';
import { useReviewsPoll } from '../hooks/use-reviews';
import { useViewsPoll } from '../hooks/use-views';
import {
  useDashboardMode,
  useSelectedAgent,
  useSelectedAgentRun,
  useSelectedIssue,
} from '../lib/navigation';
import type { Presentation } from '../lib/dashboard-search';

export function needsWorkspaceLogActivity(
  mode: Presentation,
  selected: { issue: string | null; agent: string | null; agentRun: string | null },
): boolean {
  return (
    (mode !== 'agents' && mode !== 'reviews') ||
    selected.issue !== null ||
    selected.agent !== null ||
    selected.agentRun !== null
  );
}

/** The one refresh authority for dashboard-wide resources in the selected workspace.
 * All page, sidebar, badge, notification, and dialog consumers use disabled readers. */
export function WorkspaceResourcePolls() {
  const mode = useDashboardMode();
  const logActivity = needsWorkspaceLogActivity(mode, {
    issue: useSelectedIssue(),
    agent: useSelectedAgent(),
    agentRun: useSelectedAgentRun(),
  });
  useBoardPoll();
  useAgentsPoll();
  useLogActivityPoll(logActivity);
  useReviewsPoll();
  useViewsPoll();
  return null;
}
