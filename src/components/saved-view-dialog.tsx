import { Check, Minus, Trash2 } from 'lucide-react';
import { sorted } from '../../shared/array';
import type { SavedView } from '../../shared/api';
import { useSavedViewBoard } from '../hooks/use-cards';
import { useSavedViews, useSaveViews } from '../hooks/use-views';
import { emptyFilter } from '../lib/board';
import { useDashboardActions } from '../lib/navigation';
import { cn } from '../lib/utils';
import { useDashboardStore } from '../store';
import { ErrorNotice, LabelPill } from './issue-parts';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';

const closedViewFilter = emptyFilter();

export function SavedViewDialog() {
  const draft = useDashboardStore((state) =>
    state.overlay.kind === 'view' ? state.overlay : null,
  );
  const renameDraft = useDashboardStore((state) => state.renameDraft);
  const setDraftTerm = useDashboardStore((state) => state.setDraftTerm);
  const setDraftMode = useDashboardStore((state) => state.setDraftMode);
  const closeOverlay = useDashboardStore((state) => state.closeOverlay);
  const board = useSavedViewBoard(draft?.filter ?? closedViewFilter);
  const views = useSavedViews();
  const mutation = useSaveViews();
  const { selectView } = useDashboardActions();
  if (draft === null) return null;
  function saveView(current: typeof draft) {
    if (current === null) return;
    const view: SavedView = {
      id: current.id ?? `view-${Date.now().toString(36)}`,
      name: current.name.trim(),
      filter: current.filter,
    };
    const next =
      current.id === null
        ? [...(views.data ?? []), view]
        : (views.data ?? []).map((item) => (item.id === view.id ? view : item));
    mutation.mutate(next, {
      onSuccess: () => {
        selectView(view);
        closeOverlay();
      },
    });
  }
  function deleteView(current: typeof draft) {
    if (current === null) return;
    mutation.mutate(
      (views.data ?? []).filter((view) => view.id !== current.id),
      {
        onSuccess: () => {
          selectView(null);
          closeOverlay();
        },
      },
    );
  }
  return (
    <Dialog open onOpenChange={(open) => !open && closeOverlay()}>
      <DialogContent className="dashboard-dialog">
        <DialogHeader>
          <DialogTitle>{draft.id ? 'Edit your view' : 'A view for your kind of work'}</DialogTitle>
          <DialogDescription>
            Save these filters to this workspace. Open the same view from any device.
          </DialogDescription>
        </DialogHeader>
        <label className="form-label" htmlFor="view-name">
          View name
          <Input
            id="view-name"
            placeholder="e.g. Platform work"
            value={draft.name}
            onChange={(event) => renameDraft(event.target.value)}
            maxLength={80}
          />
        </label>
        {board.data && (
          <>
            <div className="view-draft-summary">
              <strong>{board.data.matchingCount} matching issues</strong>
              <span>
                {draft.filter.includeClosed ? 'Includes completed' : 'Active issues'}
                {draft.filter.query && ` · “${draft.filter.query}”`}
                {draft.filter.lanes.length > 0 && ` · ${draft.filter.lanes.join(', ')}`}
                {draft.filter.types.length > 0 && ` · ${draft.filter.types.join(', ')}`}
                {draft.filter.priorities.length > 0 && ` · ${draft.filter.priorities.join(', ')}`}
              </span>
              <small>Search, status, type, and priority come from the current view.</small>
            </div>
            <div className="flex items-center justify-between">
              <span className="form-label">Label rules</span>
              <div className="segmented-control">
                <button
                  className={cn(draft.filter.mode === 'and' && 'selected')}
                  onClick={() => setDraftMode('and')}
                >
                  Match all
                </button>
                <button
                  className={cn(draft.filter.mode === 'or' && 'selected')}
                  onClick={() => setDraftMode('or')}
                >
                  Match any
                </button>
              </div>
            </div>
            <div className="view-label-rules">
              {sorted([
                ...new Set([
                  ...board.data.labels.map(({ label }) => label),
                  ...Object.keys(draft.filter.terms),
                ]),
              ]).map((label) => (
                <div className="label-rule" key={label}>
                  <LabelPill label={label} />
                  <div>
                    <button
                      aria-label={`Include ${label}`}
                      aria-pressed={draft.filter.terms[label] === 'include'}
                      className={cn(draft.filter.terms[label] === 'include' && 'include')}
                      onClick={() =>
                        setDraftTerm(
                          label,
                          draft.filter.terms[label] === 'include' ? null : 'include',
                        )
                      }
                    >
                      <Check className="size-3" />
                      Include
                    </button>
                    <button
                      aria-label={`Exclude ${label}`}
                      aria-pressed={draft.filter.terms[label] === 'exclude'}
                      className={cn(draft.filter.terms[label] === 'exclude' && 'exclude')}
                      onClick={() =>
                        setDraftTerm(
                          label,
                          draft.filter.terms[label] === 'exclude' ? null : 'exclude',
                        )
                      }
                    >
                      <Minus className="size-3" />
                      Exclude
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="input-hint">
              Excluded labels always stay out, even when matching any label.
            </p>
          </>
        )}
        {mutation.error && <ErrorNotice error={mutation.error} />}
        <DialogFooter>
          {draft.id && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              disabled={mutation.isPending || !views.isSuccess}
              onClick={() => deleteView(draft)}
            >
              <Trash2 />
              Delete view
            </Button>
          )}
          <Button variant="outline" onClick={closeOverlay}>
            Cancel
          </Button>
          <Button
            onClick={() => saveView(draft)}
            disabled={
              !draft.name.trim() ||
              mutation.isPending ||
              !views.isSuccess ||
              board.data === undefined
            }
          >
            {mutation.isPending ? 'Saving…' : 'Save view'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
