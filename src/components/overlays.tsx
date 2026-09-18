import { useDashboardStore } from '../store';
import { DeleteCardDialog } from './card-actions';
import { SavedViewDialog } from './saved-view-dialog';
import { ShortcutDialog } from './shortcut-dialog';

export function DashboardOverlays() {
  const kind = useDashboardStore((state) => state.overlay.kind);
  const deleteTarget = useDashboardStore((state) =>
    state.overlay.kind === 'delete-card' ? state.overlay.target : null,
  );
  if (kind === 'delete-card' && deleteTarget)
    return <DeleteCardDialog key={deleteTarget.id} target={deleteTarget} />;
  if (kind === 'view') return <SavedViewDialog />;
  if (kind === 'shortcuts') return <ShortcutDialog />;
  return null;
}
