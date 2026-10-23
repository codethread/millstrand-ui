import type { Card, LinkTarget } from '../shared/api.ts';
import { z } from 'zod';

/** The mirror's stored `kanban/link` plus the last-known parts of `kanban/link-snapshot`. */
export interface StoredLink {
  workspace: string;
  card: string;
  owner: string | null;
  branch: string | null;
  observedAt: string | null;
}

/** Downstream board as read for an overlay; never the downstream's own linked overlay. */
export type LinkedSource =
  | { kind: 'available'; workspaceId: string; workspaceName: string; cards: readonly Card[] }
  | { kind: 'unavailable'; workspaceId: string; workspaceName: string; reason: string };

export type ResolveLinkedSource = (workspace: string) => Promise<LinkedSource>;

const storedLinkSchema = z.compile(
  z.object({ workspace: z.string().min(1), card: z.string().min(1) }).loose(),
  { strict: true },
);
// The spool omits absent snapshot fields rather than storing nulls.
const snapshotSchema = z.compile(
  z
    .object({
      owner: z.string().optional(),
      branch: z.string().optional(),
      'observed-at': z.string().optional(),
    })
    .loose(),
  { strict: true },
);

/** Parses the spool-owned link attributes; malformed values fail the whole read loudly. */
export function parseStoredLink(attrs: Record<string, unknown>): StoredLink | null {
  const link = attrs['kanban/link'];
  if (link === undefined || link === null) return null;
  const target = storedLinkSchema.safeParse(link);
  if (!target.success) throw new Error('kanban/link must be an object with workspace and card');
  const snapshot = snapshotSchema.safeParse(attrs['kanban/link-snapshot'] ?? {});
  if (!snapshot.success) throw new Error('kanban/link-snapshot must be an object');
  return {
    workspace: target.data.workspace,
    card: target.data.card,
    owner: snapshot.data.owner ?? null,
    branch: snapshot.data.branch ?? null,
    observedAt: snapshot.data['observed-at'] ?? null,
  };
}

/**
 * Downstream authority: a readable source replaces the mirror's title, lifecycle, lane and
 * ownership. Otherwise the stored mirror stays visible and explicitly unavailable.
 * Local labels, priority and epic grouping always remain the coordinator's own.
 */
export function overlayLinkedCard(card: Card, link: StoredLink, source: LinkedSource): Card {
  const target: LinkTarget = {
    workspace: link.workspace,
    workspaceId: source.workspaceId,
    workspaceName: source.workspaceName,
    card: link.card,
  };
  const downstream =
    source.kind === 'available'
      ? source.cards.find((candidate) => candidate.id === link.card)
      : undefined;
  if (downstream === undefined) {
    const reason =
      source.kind === 'unavailable'
        ? source.reason
        : `Card ${link.card} is not on the ${source.workspaceName} board.`;
    return {
      ...card,
      owner: link.owner,
      branch: link.branch,
      link: { status: 'unavailable', target, reason, observedAt: link.observedAt },
    };
  }
  return {
    ...card,
    title: downstream.title,
    state: downstream.state,
    lane: downstream.lane,
    outcome: downstream.outcome,
    owner: downstream.owner,
    branch: downstream.branch,
    link: { status: 'live', target },
  };
}
