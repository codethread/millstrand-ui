import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { WorkspaceOption } from '../../shared/api';
import { workspaceActivity } from '../lib/overview';
import { WorkspaceActivity } from './workspace-activity';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
const workspace: WorkspaceOption = {
  id: 'one',
  name: 'One',
  path: '/one/.millstrand',
  status: 'running',
};

it('shows unavailable card counts independently of a successful empty agent snapshot', () => {
  const html = renderToStaticMarkup(
    <WorkspaceActivity
      activity={workspaceActivity(
        workspace,
        { data: null, health: { kind: 'failed', message: 'No Kanban surface' } },
        { data: [], health: { kind: 'live' } },
      )}
      onRetry={vi.fn()}
    />,
  );
  expect(html).toContain('· —');
  expect(html).toContain('No Kanban surface');
  expect(html).toContain('Retry cards');
  expect(html).toContain('No running or queued agents.');
  expect(html).not.toContain('No in-progress, review, or production cards.');
});

it('keeps offline empty snapshots last-known and suppresses navigation and retries', () => {
  const html = renderToStaticMarkup(
    <WorkspaceActivity
      activity={workspaceActivity(
        { ...workspace, status: 'offline' },
        { data: [], health: { kind: 'failed', message: 'Disconnected' } },
        { data: [], health: { kind: 'live' } },
      )}
      onRetry={vi.fn()}
    />,
  );
  expect(html).toContain('last-known data only');
  expect(html).toContain('No active agents in the last snapshot.');
  expect(html).toContain('No in-progress, review, or production cards in the last snapshot.');
  expect(html).toContain('disabled=""');
  expect(html).not.toContain('href=');
});
