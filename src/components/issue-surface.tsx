import { lazy, Suspense } from 'react';
import { useIssueBoard } from '../hooks/use-cards';
import { useDashboardMode, useIssueFilter } from '../lib/navigation';
import { BoardView, EmptyBoard, OutlineView } from './board-view';
import { Loading } from './issue-parts';

const GraphView = lazy(() => import('./graph-view'));

/** Stable issue-page entry. Board, outline, and graph internals can evolve without
 * making the dashboard shell a carrier for their query snapshots. */
export function IssueSurface() {
  const mode = useDashboardMode();
  const filter = useIssueFilter();
  const board = useIssueBoard(filter);
  const allCards = board.data?.allCards ?? [];
  const cards = board.data?.cards ?? [];
  if (mode === 'graph')
    return (
      <Suspense fallback={<Loading text="Loading graph…" />}>
        <GraphView cards={cards} allCards={allCards} />
      </Suspense>
    );
  if (cards.length === 0) return <EmptyBoard />;
  return mode === 'board' ? (
    <BoardView columns={board.data?.columns ?? []} />
  ) : (
    <OutlineView groups={board.data?.outline ?? []} />
  );
}
