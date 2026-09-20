import type { AgentIdentity, Card, WorkspaceOption } from '../../shared/api';
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

export function overviewCards(cards: Card[]): Card[] {
  return selectCards(cards, { ...emptyFilter(), lanes: ['claimed', 'in_review', 'in_production'] });
}
