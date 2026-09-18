import type { AgentIdentity, AgentRun } from '../../shared/api';
import type { LogEvent } from '../../shared/log-lab';
import { sorted } from '../../shared/array';
import { currentRun, runTargets } from './agents';
import { eventLabel, eventText } from './log-lab';

export const logLabEnabled = import.meta.env['VITE_LOG_LAB'] === 'true';
export interface CardLogAgent {
  identity: AgentIdentity;
  run: AgentRun | null;
  relation: 'target' | 'owner';
}
/** Targeted sessions first, including recent completed work. Owner-only logs are labelled separately. */
export function cardLogAgents(
  agents: AgentIdentity[],
  owner: string | null,
  target: string,
): CardLogAgent[] {
  const matches = agents.flatMap((identity): CardLogAgent[] => {
    const targeted =
      identity.runs.find((run) => run.status === 'running' && runTargets(run, target)) ??
      identity.runs.find((run) => runTargets(run, target));
    if (targeted) return [{ identity, run: targeted, relation: 'target' }];
    if (identity.id === owner) return [{ identity, run: currentRun(identity), relation: 'owner' }];
    return [];
  });
  return sorted(
    matches,
    (a, b) =>
      Number(b.run?.status === 'running') - Number(a.run?.status === 'running') ||
      Number(a.relation === 'owner') - Number(b.relation === 'owner') ||
      (b.run?.createdAt ?? '').localeCompare(a.run?.createdAt ?? ''),
  );
}
export function briefEvent(event: LogEvent): string {
  const text = eventText(event.record).replaceAll(/\s+/g, ' ');
  const path = event.record.file_path;
  return `${eventLabel(event.record)} · ${path ? path.split('/').slice(-2).join('/') : text.slice(0, 140)}`;
}
