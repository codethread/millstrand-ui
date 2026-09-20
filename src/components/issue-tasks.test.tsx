import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TaskActivity } from './issue-tasks';

it('retains task activity with an explicit refresh failure instead of hiding it', () => {
  const html = renderToStaticMarkup(
    <TaskActivity
      notes={[
        {
          id: 'note',
          text: 'Saved task progress',
          actor: {
            identity: 'worker',
            status: 'resolved',
            identityStrandIds: ['worker-id'],
          },
          at: '2026-01-01',
          kind: null,
          truncated: false,
        },
      ]}
      error={new Error('Refresh failed')}
      pending={false}
    />,
  );
  expect(html).toContain('Saved task progress');
  expect(html).toContain('Refresh failed');
  expect(html).toContain('Showing last-known task activity.');
});

it('distinguishes initial loading, unavailable notes and successful empty activity', () => {
  expect(renderToStaticMarkup(<TaskActivity notes={undefined} error={null} pending />)).toContain(
    'Loading notes',
  );
  const failed = renderToStaticMarkup(
    <TaskActivity notes={undefined} error={new Error('Offline')} pending={false} />,
  );
  expect(failed).toContain('Offline');
  expect(failed).not.toContain('No notes yet');
  expect(renderToStaticMarkup(<TaskActivity notes={[]} error={null} pending={false} />)).toContain(
    'No notes yet',
  );
});
