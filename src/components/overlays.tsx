import { Check, Keyboard, Minus, RotateCcw, Trash2 } from 'lucide-react';
import type { Board, SavedView } from '../../shared/api';
import { useSaveViews } from '../lib/api';
import { selectCards } from '../lib/board';
import { cn } from '../lib/utils';
import { shortcutLabels, useDashboardStore, type ShortcutAction } from '../store';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { ErrorNotice, LabelPill } from './issue-parts';

export function DashboardOverlays({
  board,
  views,
  viewsReady,
}: {
  board: Board;
  views: SavedView[];
  viewsReady: boolean;
}) {
  const s = useDashboardStore();
  const mutation = useSaveViews();
  const overlay = s.overlay;
  function saveView() {
    if (overlay.kind !== 'view') return;
    const view: SavedView = {
      id: overlay.id ?? `view-${Date.now().toString(36)}`,
      name: overlay.name.trim(),
      filter: overlay.filter,
    };
    const next =
      overlay.id === null
        ? [...views, view]
        : views.map((item) => (item.id === view.id ? view : item));
    mutation.mutate(next, { onSuccess: () => s.savedView(view) });
  }
  function deleteView() {
    if (overlay.kind !== 'view') return;
    mutation.mutate(
      views.filter((view) => view.id !== overlay.id),
      {
        onSuccess: () => {
          s.selectView(null);
          s.closeOverlay();
        },
      },
    );
  }
  return (
    <Dialog
      open={overlay.kind !== 'closed'}
      onOpenChange={(open) => {
        if (!open) {
          s.closeOverlay();
          mutation.reset();
        }
      }}
    >
      <DialogContent className="dashboard-dialog">
        {overlay.kind === 'view' ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {overlay.id ? 'Edit your view' : 'A view for your kind of work'}
              </DialogTitle>
              <DialogDescription>
                Save these filters to this workspace. Open the same view from any device.
              </DialogDescription>
            </DialogHeader>
            <label className="form-label">
              View name
              <Input
                autoFocus
                placeholder="e.g. Platform work"
                value={overlay.name}
                onChange={(event) => s.renameDraft(event.target.value)}
                maxLength={80}
              />
            </label>
            <div className="view-draft-summary">
              <strong>{selectCards(board.cards, overlay.filter).length} matching issues</strong>
              <span>
                {overlay.filter.includeClosed ? 'Includes completed' : 'Active issues'}
                {overlay.filter.query && ` · “${overlay.filter.query}”`}
                {overlay.filter.lanes.length > 0 && ` · ${overlay.filter.lanes.join(', ')}`}
                {overlay.filter.types.length > 0 && ` · ${overlay.filter.types.join(', ')}`}
                {overlay.filter.priorities.length > 0 &&
                  ` · ${overlay.filter.priorities.join(', ')}`}
              </span>
              <small>Search, status, type, and priority come from the current view.</small>
            </div>
            <div className="flex items-center justify-between">
              <span className="form-label">Label rules</span>
              <div className="segmented-control">
                <button
                  className={cn(overlay.filter.mode === 'and' && 'selected')}
                  onClick={() => s.setDraftMode('and')}
                >
                  Match all
                </button>
                <button
                  className={cn(overlay.filter.mode === 'or' && 'selected')}
                  onClick={() => s.setDraftMode('or')}
                >
                  Match any
                </button>
              </div>
            </div>
            <div className="view-label-rules">
              {[
                ...new Set([
                  ...board.labels.map(({ label }) => label),
                  ...Object.keys(overlay.filter.terms),
                ]),
              ]
                .sort()
                .map((label) => (
                  <div className="label-rule" key={label}>
                    <LabelPill label={label} />
                    <div>
                      <button
                        aria-label={`Include ${label}`}
                        aria-pressed={overlay.filter.terms[label] === 'include'}
                        className={cn(overlay.filter.terms[label] === 'include' && 'include')}
                        onClick={() =>
                          s.setDraftTerm(
                            label,
                            overlay.filter.terms[label] === 'include' ? null : 'include',
                          )
                        }
                      >
                        <Check className="size-3" />
                        Include
                      </button>
                      <button
                        aria-label={`Exclude ${label}`}
                        aria-pressed={overlay.filter.terms[label] === 'exclude'}
                        className={cn(overlay.filter.terms[label] === 'exclude' && 'exclude')}
                        onClick={() =>
                          s.setDraftTerm(
                            label,
                            overlay.filter.terms[label] === 'exclude' ? null : 'exclude',
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
            {mutation.error && <ErrorNotice error={mutation.error} />}
            <DialogFooter>
              {overlay.id && (
                <Button
                  variant="ghost"
                  className="mr-auto text-destructive"
                  disabled={mutation.isPending || !viewsReady}
                  onClick={deleteView}
                >
                  <Trash2 />
                  Delete view
                </Button>
              )}
              <Button variant="outline" onClick={s.closeOverlay}>
                Cancel
              </Button>
              <Button
                onClick={saveView}
                disabled={!overlay.name.trim() || mutation.isPending || !viewsReady}
              >
                {mutation.isPending ? 'Saving…' : 'Save view'}
              </Button>
            </DialogFooter>
          </>
        ) : overlay.kind === 'shortcuts' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Keyboard className="size-5" />
                Make yourself at home
              </DialogTitle>
              <DialogDescription>
                Customize your shortcuts. Changes are saved in this browser and shortcuts pause
                while you’re typing.
              </DialogDescription>
            </DialogHeader>
            <div className="shortcut-list">
              {(Object.keys(shortcutLabels) as ShortcutAction[]).map((action) => (
                <label className="shortcut-row" key={action}>
                  <span>{shortcutLabels[action]}</span>
                  <Input
                    aria-label={shortcutLabels[action]}
                    value={s.shortcuts[action]}
                    placeholder="Disabled"
                    onChange={(event) => s.setShortcut(action, event.target.value.toLowerCase())}
                  />
                </label>
              ))}
            </div>
            <p className="input-hint">
              Use keys like <code>g</code>, <code>shift+g</code>, or <code>ctrl+k</code>. Clear a
              field to disable its shortcut. Escape closes a panel.
            </p>
            <DialogFooter>
              <Button variant="ghost" className="mr-auto" onClick={s.resetShortcuts}>
                <RotateCcw />
                Reset defaults
              </Button>
              <Button onClick={s.closeOverlay}>Done</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
