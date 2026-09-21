import { useCallback, useMemo } from 'react';
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Board, Card, CardLane, ViewFilter } from '../../shared/api';
import { useNavigate } from '@tanstack/react-router';
import {
  boardQueryOptions,
  cardActionMutationOptions,
  cardQueryOptions,
  cardNotesQueryOptions,
  graphQueryOptions,
  labelsMutationOptions,
  taskNotesQueryOptions,
} from '../lib/api/cards';
import {
  boardSidebarContent,
  completedHistory,
  filteredCardCount,
  issueSurfaceContent,
  savedViewBoardContent,
} from '../lib/board';
import { useWorkspace } from './use-workspace';
import { useDashboardStore } from '../store';

const selectBoardWorkspace = (board: Board) => board.workspace;
const selectBoardFetchedAt = (board: Board) => board.fetchedAt;
const selectBoardSnapshot = () => true;
const selectBoardSidebarContent = (board: Board) => boardSidebarContent(board);

export function useBoardPoll() {
  return useQuery(boardQueryOptions(useWorkspace()));
}

/** Cache reader for board internals that consume the full response.
 * Shell consumers use the concrete projections below. */
export function useBoard() {
  return useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
  });
}

export function useBoardWorkspace() {
  return useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectBoardWorkspace,
  });
}

export function useBoardSnapshot() {
  return useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectBoardSnapshot,
  });
}

export function useBoardStatus() {
  return useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectBoardFetchedAt,
  });
}

export function useBoardSidebar() {
  return useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectBoardSidebarContent,
  });
}

const selectBoardCards = (board: Board) => board.cards;

const selectBoardLabels = (board: Board) => board.labels;

export function useBoardLabels() {
  return useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectBoardLabels,
  });
}

export function useIssueBoard(filter: ViewFilter) {
  const query = useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectBoardCards,
  });
  const cards = query.data;
  const data = useMemo(
    () => (cards === undefined ? undefined : issueSurfaceContent(cards, filter)),
    [cards, filter],
  );
  return { data };
}

export function useCompletedHistory(search: string, filter: ViewFilter) {
  const query = useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select: selectBoardCards,
  });
  const cards = query.data;
  const data = useMemo(
    () => (cards === undefined ? undefined : completedHistory(cards, { ...filter, query: search })),
    [cards, search, filter],
  );
  return { data };
}

export function useFilteredCardCount(filter: ViewFilter) {
  const select = useCallback((board: Board) => filteredCardCount(board, filter), [filter]);
  return useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select,
  });
}

export function useSavedViewBoard(filter: ViewFilter) {
  const select = useCallback((board: Board) => savedViewBoardContent(board, filter), [filter]);
  return useQuery({
    ...boardQueryOptions(useWorkspace()),
    enabled: false,
    refetchInterval: false,
    select,
  });
}

export function useCard(id: string) {
  return useQuery(cardQueryOptions(useWorkspace(), id));
}

export function useCardNotes(id: string, enabled: boolean) {
  return useQuery(cardNotesQueryOptions(useWorkspace(), id, enabled));
}

export function useGraph(id: string | null) {
  return useQuery(graphQueryOptions(useWorkspace(), id));
}

export function useTaskNotes(cardId: string, taskId: string, enabled: boolean) {
  return useQuery(taskNotesQueryOptions(useWorkspace(), cardId, taskId, enabled));
}

export function useLabels(id: string) {
  const workspace = useWorkspace();
  return useMutation(labelsMutationOptions(useQueryClient(), workspace, id));
}

export function useCardAction() {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/' });
  return useMutation({
    ...cardActionMutationOptions(useQueryClient(), workspace),
    onSuccess: (_result, { id, action }) => {
      if (action.kind === 'delete')
        void navigate({
          from: '/',
          to: '/',
          search: (old) =>
            'workspace' in old && old.workspace === workspace
              ? {
                  ...old,
                  issue: old.issue === id ? null : old.issue,
                  graphRoot: old.graphRoot === id ? null : old.graphRoot,
                }
              : old,
          replace: true,
        });
    },
  });
}

export function useCardActionFeedback() {
  const workspace = useWorkspace();
  const states = useMutationState({
    filters: { mutationKey: ['card-action', workspace] },
    select: (mutation) => ({ status: mutation.state.status, error: mutation.state.error }),
  });
  return states.at(-1) ?? null;
}

export function useCardActionPending() {
  return useIsMutating({ mutationKey: ['card-action', useWorkspace()] }) > 0;
}

export function useCardMenu(card: Card) {
  const mutation = useCardAction();
  const pending = useCardActionPending();
  const confirmDelete = useDashboardStore((state) => state.confirmDeleteCard);
  return {
    pending,
    move: (lane: CardLane) => mutation.mutate({ id: card.id, action: { kind: 'move', lane } }),
    confirmDelete: () => confirmDelete({ id: card.id, title: card.title }),
  };
}

export function useDeleteCard(id: string) {
  const mutation = useCardAction();
  const close = useDashboardStore((state) => state.closeOverlay);
  return {
    pending: mutation.isPending,
    error: mutation.error,
    close,
    remove: () => mutation.mutate({ id, action: { kind: 'delete' } }, { onSuccess: close }),
  };
}

export function useLabelEditor(id: string) {
  const mutation = useLabels(id);
  return {
    pending: mutation.isPending,
    error: mutation.error,
    add: (value: string, onSuccess: () => void) => {
      const labels = value
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean);
      if (labels.length) mutation.mutate({ action: 'add', labels }, { onSuccess });
    },
    remove: (label: string) => mutation.mutate({ action: 'remove', labels: [label] }),
  };
}
