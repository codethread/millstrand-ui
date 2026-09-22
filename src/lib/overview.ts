import type { AgentIdentity, Card, WorkspaceOption } from '../../shared/api';
import type { LogBinding } from '../../shared/log-activity';
import { currentRun } from './agents';
import { emptyFilter, selectCards } from './board';
import type { WorkspacePreferences } from './workspaces';

export type ActivityHealth =
  { kind: 'loading' } | { kind: 'live' } | { kind: 'failed'; message: string };

export interface CardActivity {
  data: Card[] | null;
  health: ActivityHealth;
}

export interface AgentActivity {
  data: AgentIdentity[] | null;
  health: ActivityHealth;
}

export interface WorkspaceActivityModel {
  workspace: WorkspaceOption;
  board: CardActivity;
  agents: AgentActivity;
  status: 'offline' | 'unavailable' | 'loading' | 'live';
}

export function workspaceActivity(
  workspace: WorkspaceOption,
  board: CardActivity,
  agents: AgentActivity,
): WorkspaceActivityModel {
  const status =
    workspace.status !== 'running'
      ? 'offline'
      : board.health.kind === 'failed' || agents.health.kind === 'failed'
        ? 'unavailable'
        : board.health.kind === 'loading' || agents.health.kind === 'loading'
          ? 'loading'
          : 'live';
  return { workspace, board, agents, status };
}

export function overviewActivity(
  snapshots: WorkspaceActivityModel[],
  preferences: WorkspacePreferences = {},
) {
  const pinned: WorkspaceActivityModel[] = [];
  const busy: WorkspaceActivityModel[] = [];
  const other: WorkspaceActivityModel[] = [];
  let cardCount = 0;
  let agentCount = 0;
  for (const snapshot of snapshots) {
    const cards = snapshot.board.data?.length ?? 0;
    const agents = snapshot.agents.data?.length ?? 0;
    (preferences[snapshot.workspace.id]?.kind === 'pinned'
      ? pinned
      : cards + agents > 0
        ? busy
        : other
    ).push(snapshot);
    cardCount += cards;
    agentCount += agents;
  }
  return {
    pinned,
    busy,
    other,
    cardCount,
    agentCount,
    partial: snapshots.some((snapshot) => snapshot.status !== 'live'),
  };
}

export const defaultAttentionLabels = [
  'human-attention',
  'agent-blocked',
  'needs-decision',
  'factory-escalated',
];

export function overviewCards(cards: Card[], attentionLabels: string[]): Card[] {
  return selectCards(cards, emptyFilter()).filter(
    (card) =>
      ['claimed', 'in_review', 'in_production'].includes(card.lane) ||
      attentionReason(card, attentionLabels) !== null,
  );
}

export function attentionReason(card: Card, labels: string[]): string | null {
  const matched = labels.filter((label) => card.labels.includes(label));
  return matched.length ? matched.join(' · ') : null;
}

export type AgentPulse =
  | { kind: 'unknown' }
  | { kind: 'last-known' }
  | { kind: 'recent' | 'quiet'; timestamp: string; age: string };

/** A quiet log is evidence of silence, never proof of a stalled process. */
export function agentPulse(
  running: boolean,
  binding: LogBinding | null,
  stale: boolean,
  now: number,
): AgentPulse {
  if (stale) return { kind: 'last-known' };
  const activity = binding?.activity;
  if (activity?.kind !== 'available' || !activity.latest) return { kind: 'unknown' };
  const timestamp = activity.latest.record.ts;
  const seconds = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000));
  if (!Number.isFinite(seconds)) return { kind: 'unknown' };
  const age =
    seconds < 60
      ? `${seconds}s`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m`
        : `${Math.floor(seconds / 3600)}h`;
  return { kind: running && seconds >= 300 ? 'quiet' : 'recent', timestamp, age };
}

export interface CockpitCard {
  workspace: WorkspaceOption;
  card: Card;
  reason: string | null;
  stale: boolean;
}
export interface CockpitAgent {
  workspace: WorkspaceOption;
  identity: AgentIdentity;
  target: Card | null;
  stale: boolean;
  pulse: AgentPulse;
}
export interface CockpitLogRead {
  bindings: LogBinding[] | null;
  failed: boolean;
}

export function cockpitWork(
  snapshots: WorkspaceActivityModel[],
  logs: CockpitLogRead[],
  filter: { search: string; scope: string | null; attentionLabels: string[] },
  now: number,
) {
  const cards: CockpitCard[] = [];
  const agents: CockpitAgent[] = [];
  const words = filter.search.trim().toLowerCase().split(/\s+/);
  const matches = (text: string) => words.every((word) => text.toLowerCase().includes(word));
  for (const [index, snapshot] of snapshots.entries()) {
    const { workspace, board } = snapshot;
    if (filter.scope !== null && workspace.id !== filter.scope) continue;
    const offline = workspace.status !== 'running';
    for (const card of board.data ?? []) {
      if (matches([workspace.name, card.title, card.id, card.owner, ...card.labels].join(' ')))
        cards.push({
          workspace,
          card,
          reason: attentionReason(card, filter.attentionLabels),
          stale: offline || board.health.kind !== 'live',
        });
    }
    const log = logs[index];
    for (const identity of snapshot.agents.data ?? []) {
      const run = currentRun(identity);
      const target = board.data?.find((card) => card.id === run?.target) ?? null;
      if (
        !matches(
          [workspace.name, identity.id, identity.harness, run?.model, target?.title].join(' '),
        )
      )
        continue;
      const stale = offline || snapshot.agents.health.kind !== 'live';
      agents.push({
        workspace,
        identity,
        target,
        stale,
        pulse: agentPulse(
          run?.status === 'running' && run.substatus !== 'requested',
          log?.bindings?.find((binding) => binding.identityStrandId === identity.strandId) ?? null,
          stale || log?.failed === true,
          now,
        ),
      });
    }
  }
  return {
    attention: cards.filter(({ reason }) => reason !== null),
    review: cards.filter(({ card, reason }) => card.lane === 'in_review' && reason === null),
    quiet: agents.filter(({ pulse }) => pulse.kind === 'quiet'),
    agents,
  };
}
