import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseReviewDetail } from '../../server/reviews';
import { review } from '../../server/reviews.fixture';
import { reviewDetailModel } from '../lib/reviews';
import { ReviewReport } from './review-report';

function detail() {
  return parseReviewDetail({
    review: {
      ...review,
      current: false,
      report: '# Complete report\n\nOriginal **Markdown**.',
      worktree: '/workspace/review',
      reviewers: [
        {
          ...review.reviewers[0],
          runId: 'run-1',
          result: '# Reviewer evidence',
          error: 'Reviewer warning',
        },
      ],
      notes: [{ id: 'note-1', text: 'Activity body', at: null, by: 'Reviewer', kind: 'summary' }],
      links: [{ id: 'feature-1', title: 'Related feature', type: 'kanban' }],
      history: [{ ...review, id: 'older', current: false }],
    },
  });
}

describe('ReviewReport', () => {
  it('renders original report metadata and the concrete prompt/comments slots', () => {
    const html = renderToStaticMarkup(
      <ReviewReport
        model={reviewDetailModel(detail())}
        reviewerRunIdentities={{ 'run-1': 'agent-1' }}
        integrations={{
          prompt: <button>Shared prompt entry</button>,
          comments: <section aria-label="Curated comments slot">Comments integration</section>,
        }}
        onOpenAgentRun={() => undefined}
        onOpenHistory={() => undefined}
        onOpenRelatedStrand={() => undefined}
      />,
    );

    expect(html).toContain('Complete report');
    expect(html).toContain('Original <strong>Markdown</strong>');
    expect(html).toContain('Outdated at last poll');
    expect(html).toContain('It still awaits a local decision.');
    expect(html).toContain('Shared prompt entry');
    expect(html).toContain('Curated comments slot');
    expect(html).toContain('Inspect agent run');
    expect(html).toContain('Related feature');
    expect(html).toContain('Review history');
    expect(html).toContain('Activity · 1 notes');
  });
});
