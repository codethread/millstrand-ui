import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { parseCard } from '../../server/parse';
import { emptyProvenance } from '../../server/provenance';
import type { JsonValue } from '../../shared/api';
import { AutoRunDetails } from './auto-run';

function autoRun(attributes: Record<string, JsonValue>) {
  return parseCard(
    {
      id: 'card1',
      title: 'Card',
      state: 'active',
      created_at: '2026-09-17',
      attributes,
    },
    emptyProvenance(),
  ).autoRun;
}

it('does not add auto-run chrome to ordinary cards', () => {
  expect(renderToStaticMarkup(<AutoRunDetails autoRun={null} />)).toBe('');
});

it('shows label-only opt-in without suggesting a worker is active or configured', () => {
  const value = autoRun({ 'kanban.label/auto-run': 'true' });
  const detail = renderToStaticMarkup(<AutoRunDetails autoRun={value} />);
  expect(detail).toContain('Not set');
  expect(detail).toContain('Configuration, not worker activity');
  expect(detail).toContain('does not confirm eligibility or a running worker');
});

it.each(['preparing', 'assigned', 'error'])(
  'renders %s as dispatch, not worker lifecycle',
  (status) => {
    const value = autoRun({
      'auto-run/seat': 'implementer',
      'auto-run/effort': 'high',
      'auto-run/workflow': 'deliver',
      'auto-run/status': status,
      'auto-run/run-id': 'assignment-123',
      'auto-run/workflow-run-id': 'workflow-456',
      'auto-run/error': '<failure> denied',
      'auto-run/branch': 'feat/snapshot',
      'auto-run/worktree': '/work/snapshot',
    });
    const detail = renderToStaticMarkup(<AutoRunDetails autoRun={value} />);
    for (const text of [
      'assignment-123',
      'workflow-456',
      'feat/snapshot',
      '/work/snapshot',
      '&lt;failure&gt; denied',
    ]) {
      expect(detail).toContain(text);
    }
    expect(detail).toContain('Not opted in');
    expect(detail).toContain(`Dispatch: ${status[0]!.toUpperCase()}${status.slice(1)}`);
    expect(detail).toContain('Dispatcher snapshot');
    expect(detail).not.toContain('<button');
  },
);
