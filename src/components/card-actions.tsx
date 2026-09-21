import { useDashboardActions } from '../lib/navigation';
import { Check, MoreHorizontal, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Card } from '../../shared/api';
import { useCardMenu, useDeleteCard, useCardActionFeedback } from '../hooks/use-cards';
import { lanes } from '../lib/board';
import { useDashboardStore, type DeleteCardTarget } from '../store';

import { ErrorNotice } from './issue-parts';
import { Button } from './ui/button';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from './ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';

function preserveDeleteFocus(event: Event) {
  if (useDashboardStore.getState().overlay.kind === 'delete-card') event.preventDefault();
}

function CardMenuItems({ card, context }: { card: Card; context: boolean }) {
  const { viewCardDependencies, exploreGraph } = useDashboardActions();
  const { pending, move, confirmDelete } = useCardMenu(card);
  const Item = context ? ContextMenuItem : DropdownMenuItem;
  const Label = context ? ContextMenuLabel : DropdownMenuLabel;
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator;
  return (
    <>
      <Label>Graph</Label>
      <Item onSelect={() => exploreGraph(card.id)}>Focus epic hierarchy</Item>
      <Item onSelect={() => viewCardDependencies(card.id)}>View dependencies</Item>
      <Separator />
      <Label>Move to lane</Label>
      {lanes.map(({ id, title }) =>
        id === 'unknown' ? null : (
          <Item key={id} disabled={pending || card.lane === id} onSelect={() => move(id)}>
            <span className="size-4">{card.lane === id && <Check />}</span>
            {title}
          </Item>
        ),
      )}
      <Separator />
      <Item
        className="text-destructive focus:text-destructive"
        disabled={pending}
        onSelect={confirmDelete}
      >
        <Trash2 />
        Delete card…
      </Item>
    </>
  );
}

export function CardContextMenu({ card, children }: { card: Card; children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={preserveDeleteFocus}
        aria-label={`Actions for ${card.title}`}
      >
        <CardMenuItems card={card} context />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function CardMenuButton({ card }: { card: Card }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${card.title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={preserveDeleteFocus}>
        <CardMenuItems card={card} context={false} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CardActionFeedback() {
  const state = useCardActionFeedback();
  if (state?.error) return <ErrorNotice error={state.error} />;
  if (state?.status === 'pending')
    return (
      <output className="block px-5 py-2 text-sm text-muted-foreground">Updating card…</output>
    );
  if (state?.status === 'success')
    return (
      <output className="block px-5 py-2 text-sm text-muted-foreground">
        Card updated. Current filters may hide it.
      </output>
    );
  return null;
}

export function DeleteCardDialog({ target }: { target: DeleteCardTarget }) {
  const { pending, error, close, remove } = useDeleteCard(target.id);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById('cancel-card-delete')?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete card?</DialogTitle>
          <DialogDescription>
            Permanently delete “{target.title}” ({target.id}) and its links. Child cards and tasks
            are not deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorNotice error={error} />}
        <DialogFooter>
          <Button id="cancel-card-delete" variant="outline" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={remove}>
            {pending ? 'Deleting…' : 'Delete card'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
