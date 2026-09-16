import { Keyboard, RotateCcw } from 'lucide-react';
import { shortcutActions, shortcutLabels, useDashboardStore } from '../store';
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

export function ShortcutDialog() {
  const shortcuts = useDashboardStore((state) => state.shortcuts);
  const setShortcut = useDashboardStore((state) => state.setShortcut);
  const resetShortcuts = useDashboardStore((state) => state.resetShortcuts);
  const closeOverlay = useDashboardStore((state) => state.closeOverlay);
  return (
    <Dialog open onOpenChange={(open) => !open && closeOverlay()}>
      <DialogContent className="dashboard-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-5" />
            Make yourself at home
          </DialogTitle>
          <DialogDescription>
            Customize your shortcuts. Changes are saved in this browser and shortcuts pause while
            you’re typing.
          </DialogDescription>
        </DialogHeader>
        <div className="shortcut-list">
          {shortcutActions.map((action) => (
            <label className="shortcut-row" key={action}>
              <span>{shortcutLabels[action]}</span>
              <Input
                aria-label={shortcutLabels[action]}
                value={shortcuts[action]}
                placeholder="Disabled"
                onChange={(event) => setShortcut(action, event.target.value.toLowerCase())}
              />
            </label>
          ))}
        </div>
        <p className="input-hint">
          Use keys like <code>g</code>, <code>shift+g</code>, or <code>ctrl+k</code>. Clear a field
          to disable its shortcut. Escape closes a panel.
        </p>
        <DialogFooter>
          <Button variant="ghost" className="mr-auto" onClick={resetShortcuts}>
            <RotateCcw />
            Reset defaults
          </Button>
          <Button onClick={closeOverlay}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
