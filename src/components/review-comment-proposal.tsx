import { useId } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

export interface ReviewCommentProposalProps {
  text: string;
  busy: boolean;
  adoptDisabled?: boolean;
  errorText: string | null;
  onEdit: (text: string) => void;
  onAdopt: () => void;
  onCancel: () => void;
}

/** Adoption is explicit; displaying or editing a proposal never changes the canonical candidate. */
export function ReviewCommentProposal({
  text,
  busy,
  adoptDisabled = false,
  errorText,
  onEdit,
  onAdopt,
  onCancel,
}: ReviewCommentProposalProps) {
  const id = useId();
  return (
    <section
      aria-label="Proposed revision"
      aria-busy={busy}
      className="min-w-0 space-y-3 border-t border-border pt-4"
    >
      <label htmlFor={id} className="text-sm font-medium">
        Proposed revised text
      </label>
      <Textarea
        id={id}
        value={text}
        onChange={(event) => onEdit(event.target.value)}
        className="min-h-36"
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        Inspect and edit this proposal before adopting it. Cancel keeps the current comment text.
      </p>
      {errorText !== null && (
        <p role="alert" className="break-words text-sm text-destructive">
          {errorText}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || adoptDisabled || !text.trim()}
          onClick={onAdopt}
        >
          {busy ? 'Adopting…' : 'Adopt revised text'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
