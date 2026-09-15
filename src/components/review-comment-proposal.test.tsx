import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ReviewCommentProposal } from './review-comment-proposal';

it('retains controlled text alongside a conflict and never adopts from rendering', () => {
  const onAdopt = vi.fn();
  const html = renderToStaticMarkup(
    <ReviewCommentProposal
      text="Unsaved edits"
      busy={false}
      errorText="The comment changed. Refresh and retry."
      onEdit={vi.fn()}
      onAdopt={onAdopt}
      onCancel={vi.fn()}
    />,
  );
  expect(html).toContain('Unsaved edits');
  expect(html).toContain('role="alert"');
  expect(html).toContain('Adopt revised text');
  expect(onAdopt).not.toHaveBeenCalled();
});

it('disables duplicate adoption while allowing in-flight edits to remain controlled', () => {
  const html = renderToStaticMarkup(
    <ReviewCommentProposal
      text="Draft"
      busy
      errorText={null}
      onEdit={vi.fn()}
      onAdopt={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(html.match(/disabled=""/g)).toHaveLength(2);
  expect(html).toContain('Adopting…');
});
