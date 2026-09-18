import { ArrowUpRight, GitBranch, Layers } from 'lucide-react';
import type { Card } from '../../shared/api';
import { formatDate } from '../lib/board';
import { useDashboardActions } from '../lib/navigation';

export function IssueProperties({ card }: { card: Card }) {
  const { openCard } = useDashboardActions();
  return (
    <section className="detail-section">
      <h3 className="detail-section-title">Properties</h3>
      <dl className="property-list">
        {card.epicId && (
          <>
            <dt>Parent epic</dt>
            <dd>
              <button className="text-action" onClick={() => openCard(card.epicId!)}>
                <Layers className="size-3.5" />
                {card.epicId}
                <ArrowUpRight className="size-3" />
              </button>
            </dd>
          </>
        )}
        {card.branch && (
          <>
            <dt>Branch</dt>
            <dd>
              <GitBranch className="size-3.5" />
              {card.branch}
            </dd>
          </>
        )}
        {card.worktree && (
          <>
            <dt>Worktree</dt>
            <dd className="font-mono text-xs">{card.worktree}</dd>
          </>
        )}
        {card.source && (
          <>
            <dt>Source</dt>
            <dd>{card.source}</dd>
          </>
        )}
        {card.outcome && (
          <>
            <dt>Outcome</dt>
            <dd>{card.outcome}</dd>
          </>
        )}
        <dt>Created</dt>
        <dd>{formatDate(card.createdAt)}</dd>
        <dt>Updated</dt>
        <dd>{formatDate(card.updatedAt)}</dd>
      </dl>
    </section>
  );
}
