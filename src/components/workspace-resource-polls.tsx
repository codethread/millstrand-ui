import { useLogActivityPoll } from '../hooks/use-log-activity';
import { useAgentsPoll } from '../hooks/use-agents';
import { useBoardPoll } from '../hooks/use-cards';
import { useReviewsPoll } from '../hooks/use-reviews';
import { useViewsPoll } from '../hooks/use-views';

/** The one refresh authority for dashboard-wide resources in the selected workspace.
 * All page, sidebar, badge, notification, and dialog consumers use disabled readers. */
export function WorkspaceResourcePolls() {
  useBoardPoll();
  useAgentsPoll();
  useLogActivityPoll();
  useReviewsPoll();
  useViewsPoll();
  return null;
}
