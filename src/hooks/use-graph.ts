import { useQuery } from '@tanstack/react-query';
import { dependencyQueryOptions } from '../lib/api/cards';
import { useWorkspace } from './use-workspace';
import { useMemo } from 'react';
import type { Card } from '../../shared/api';
import { graphFromCards, type GraphSource } from '../lib/graph';
import { useGraph } from './use-cards';

/** The mounted graph surface owns focused polling; board freshness stays shell-owned. */
export function useGraphSource(root: string | null, cards: Card[], allCards: Card[]): GraphSource {
  const query = useGraph(root);
  const boardGraph = useMemo(() => graphFromCards(cards, allCards), [cards, allCards]);
  if (root === null) return { kind: 'ready', graph: boardGraph, error: null };
  if (query.data !== undefined) return { kind: 'ready', graph: query.data, error: query.error };
  if (query.error) return { kind: 'unavailable', error: query.error };
  return { kind: 'loading' };
}

/** Mounted graph is the sole dependency poll owner. */
export function useDependencies() {
  return useQuery(dependencyQueryOptions(useWorkspace()));
}
