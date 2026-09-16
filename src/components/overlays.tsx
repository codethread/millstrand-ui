import { useDashboardStore } from '../store';
import { DeleteCardDialog } from './card-actions';
import { SavedViewDialog } from './saved-view-dialog';
import { ShortcutDialog } from './shortcut-dialog';

export function DashboardOverlays() {
  const kind = useDashboardStore((state) => state.overlay.kind);
  const deleteCard = useDashboardStore((state) =>
    state.overlay.kind === 'delete-card' ? state.overlay.card : null,
  );
  if (kind === 'delete-card' && deleteCard)
    return <DeleteCardDialog key={deleteCard.id} card={deleteCard} />;
  if (kind === 'view') return <SavedViewDialog />;
  if (kind === 'shortcuts') return <ShortcutDialog />;
  return null;
}
