import type { FormEvent } from 'react';
import { Plus, Tag, X } from 'lucide-react';
import type { Card } from '../../shared/api';
import { useLabelEditor } from '../hooks/use-cards';
import { ErrorNotice, LabelPill } from './issue-parts';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function LabelsEditor({ card }: { card: Card }) {
  const { pending, error, add, remove } = useLabelEditor(card.id);
  function addLabels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const entry = new FormData(form).get('labels');
    const value = typeof entry === 'string' ? entry : '';
    add(value, () => form.reset());
  }
  return (
    <section className="detail-labels">
      <div className="detail-section-title">
        <Tag className="size-3.5" />
        Labels<span className="editable-tag">Editable</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {card.labels.map((label) => (
          <span className="editable-label" key={label}>
            <LabelPill label={label} />
            <button
              disabled={pending}
              onClick={() => remove(label)}
              aria-label={`Remove label ${label}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={addLabels} className="label-form">
        <Input
          name="labels"
          aria-label="New labels"
          placeholder="Add a label…"
          disabled={pending}
          autoComplete="off"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <Plus />
          Add
        </Button>
      </form>
      <p className="input-hint">Lowercase slugs; separate multiple labels with commas.</p>
      {error && <ErrorNotice error={error} />}
    </section>
  );
}
