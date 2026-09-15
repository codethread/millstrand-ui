import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ReviewCommentCard, type ReviewCommentCardProps } from './review-comment-card';

const props: ReviewCommentCardProps = {
  body: 'Check **this condition** before returning.',
  positionLabel: 'src/example.ts · new line 12',
  inclusion: 'undecided',
  validationText: null,
  errorText: null,
  busy: false,
  onInclude: vi.fn(),
  onDismiss: vi.fn(),
  onPromptAgent: vi.fn(),
};

it.each(['undecided', 'included', 'dismissed'] as const)(
  'renders controlled %s choice and candidate',
  (inclusion) => {
    const html = renderToStaticMarkup(<ReviewCommentCard {...props} inclusion={inclusion} />);
    expect(html).toContain('src/example.ts · new line 12');
    expect(html).toContain('<strong>this condition</strong>');
    expect(html.match(/aria-pressed="true"/g) ?? []).toHaveLength(
      inclusion === 'undecided' ? 0 : 1,
    );
    expect(html).toContain('Prompt agent');
    expect(html.match(/disabled=""/g) ?? []).toHaveLength(inclusion === 'undecided' ? 0 : 1);
  },
);

it('disables all actions while busy and exposes validation and error feedback', () => {
  const html = renderToStaticMarkup(
    <ReviewCommentCard
      {...props}
      busy
      validationText="Position needs validation"
      errorText="Could not save choice"
    />,
  );
  expect(html.match(/disabled=""/g)).toHaveLength(3);
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('Position needs validation');
  expect(html).toContain('role="alert"');
  expect(html).toContain('Could not save choice');
});
