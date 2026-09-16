import { Check, MessageSquare, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Markdown } from './markdown';
import { Button } from './ui/button';

export interface ReviewCommentCardProps {
  body: string;
  positionLabel: string;
  inclusion: 'undecided' | 'included' | 'dismissed';
  validationText: string | null;
  errorText: string | null;
  busy: boolean;
  disabled?: boolean;
  onInclude: () => void;
  onDismiss: () => void;
  onPromptAgent: () => void;
  proposalEditor?: ReactNode;
}

/** Controlled presentation only; the caller owns identity, persistence and dispatch. */
export function ReviewCommentCard({
  body,
  positionLabel,
  inclusion,
  validationText,
  errorText,
  busy,
  disabled = false,
  onInclude,
  onDismiss,
  onPromptAgent,
  proposalEditor,
}: ReviewCommentCardProps) {
  return (
    <article
      aria-label={`Review comment · ${positionLabel}`}
      aria-busy={busy}
      className="min-w-0 space-y-4 rounded-lg border border-border bg-background p-4"
    >
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <span className="min-w-0 break-all text-muted-foreground">{positionLabel}</span>
        <output className="ml-auto rounded-full border border-border px-2 py-0.5">
          {inclusion === 'included'
            ? 'Included'
            : inclusion === 'dismissed'
              ? 'Dismissed'
              : 'Undecided'}
          {busy && ' · Working…'}
        </output>
      </header>
      <div className="min-w-0 break-words">
        <Markdown text={body} />
      </div>
      {validationText !== null && <p className="text-xs text-muted-foreground">{validationText}</p>}
      {errorText !== null && (
        <p role="alert" className="break-words text-sm text-destructive">
          {errorText}
        </p>
      )}
      <fieldset className="flex flex-wrap gap-2 border-0 p-0" aria-label="Comment actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={inclusion === 'included'}
          disabled={busy || disabled || inclusion === 'included'}
          onClick={onInclude}
        >
          <Check />
          Include
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={inclusion === 'dismissed'}
          disabled={busy || disabled || inclusion === 'dismissed'}
          onClick={onDismiss}
        >
          <X />
          Dismiss
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || disabled}
          onClick={onPromptAgent}
        >
          <MessageSquare />
          Prompt agent
        </Button>
      </fieldset>
      {proposalEditor}
    </article>
  );
}
