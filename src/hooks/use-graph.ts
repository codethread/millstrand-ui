import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dependencyQueryOptions } from '../lib/api/cards';
import { useWorkspace } from './use-workspace';
import type { Card } from '../../shared/api';
import { graphFromCards, graphHierarchyRoot, type GraphSource } from '../lib/graph';
import { useGraph } from './use-cards';

/** The mounted graph surface owns focused polling; board freshness stays shell-owned. */
export function useGraphSource(root: string | null, cards: Card[], allCards: Card[]): GraphSource {
  const query = useGraph(graphHierarchyRoot(root, allCards));
  const focusedGraph = useMemo(
    () => (query.data === undefined ? null : { ...query.data, rootId: root ?? '' }),
    [query.data, root],
  );
  const boardGraph = useMemo(
    () => (root === null ? graphFromCards(cards, allCards) : null),
    [cards, allCards, root],
  );
  if (boardGraph !== null) return { kind: 'ready', graph: boardGraph, error: null };
  if (focusedGraph !== null) return { kind: 'ready', graph: focusedGraph, error: query.error };
  if (query.error) return { kind: 'unavailable', error: query.error };
  return { kind: 'loading' };
}

/** The graph owns dependency polling only while explicit expansions are present. */
export function useDependencies(enabled: boolean) {
  return useQuery(dependencyQueryOptions(useWorkspace(), enabled));
}
