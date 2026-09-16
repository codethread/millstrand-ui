import { Check, MoreHorizontal, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Card } from '../../shared/api';
import { useCardAction, useCardActionFeedback, useCardActionPending } from '../hooks/use-cards';
import { lanes } from '../lib/board';
import { useDashboardStore } from '../store';
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

function CardMenuItems({ card, context }: { card: Card; context: boolean }) {
  const mutation = useCardAction();
  const pending = useCardActionPending();
  const Item = context ? ContextMenuItem : DropdownMenuItem;
  const Label = context ? ContextMenuLabel : DropdownMenuLabel;
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator;
  return (
    <>
      <Label>Move to lane</Label>
      {lanes.map(({ id, title }) =>
        id === 'unknown' ? null : (
          <Item
            key={id}
            disabled={pending || card.lane === id}
            onSelect={() => mutation.mutate({ id: card.id, action: { kind: 'move', lane: id } })}
          >
            <span className="size-4">{card.lane === id && <Check />}</span>
            {title}
          </Item>
        ),
      )}
      <Separator />
      <Item
        className="text-destructive focus:text-destructive"
        disabled={pending}
        onSelect={() => useDashboardStore.getState().confirmDeleteCard(card)}
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
      <ContextMenuContent aria-label={`Actions for ${card.title}`}>
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
      <DropdownMenuContent align="end">
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

export function DeleteCardDialog({ card }: { card: Card }) {
  const mutation = useCardAction();
  const close = useDashboardStore((s) => s.closeOverlay);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) close();
      }}
    >
      <DialogContent
        showCloseButton={!mutation.isPending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById('cancel-card-delete')?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete card?</DialogTitle>
          <DialogDescription>
            Permanently delete “{card.title}” ({card.id}) and its links. Child cards and tasks are
            not deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && <ErrorNotice error={mutation.error} />}
        <DialogFooter>
          <Button
            id="cancel-card-delete"
            variant="outline"
            disabled={mutation.isPending}
            onClick={close}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({ id: card.id, action: { kind: 'delete' } }, { onSuccess: close })
            }
          >
            {mutation.isPending ? 'Deleting…' : 'Delete card'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
