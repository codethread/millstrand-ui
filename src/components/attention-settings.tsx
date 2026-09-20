import { Settings2 } from 'lucide-react';
import { useAttentionStore } from '../attention-store';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Textarea } from './ui/textarea';

export function AttentionSettings() {
  const editor = useAttentionStore((state) => state.editor);
  const open = useAttentionStore((state) => state.open);
  const close = useAttentionStore((state) => state.close);
  const edit = useAttentionStore((state) => state.edit);
  const save = useAttentionStore((state) => state.save);
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto"
        aria-label="Configure attention labels"
        onClick={open}
      >
        <Settings2 className="size-4" />
      </Button>
      <Dialog
        open={editor.kind === 'editing'}
        onOpenChange={(isOpen) => {
          if (!isOpen) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Needs your attention</DialogTitle>
            <DialogDescription>
              Show active cards matching any of these labels, across all visible Kanban-enabled
              weavers. Saved in this browser, not per weaver.
            </DialogDescription>
          </DialogHeader>
          {editor.kind === 'editing' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
              className="space-y-4"
            >
              <label htmlFor="attention-labels" className="block space-y-2 text-sm font-medium">
                <span>Attention labels</span>
                <Textarea
                  id="attention-labels"
                  value={editor.text}
                  onChange={(event) => edit(event.target.value)}
                  aria-describedby="attention-label-help"
                />
              </label>
              <p id="attention-label-help" className="text-xs text-muted-foreground">
                Separate labels with commas or spaces. Leave empty to turn off attention matches.
                Review cards still appear under Ready for a look.
              </p>
              {editor.error && (
                <p role="alert" className="text-sm text-destructive">
                  {editor.error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit">Save labels</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
