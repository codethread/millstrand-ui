import { describe, expect, it } from 'vitest';
import { verifyReviewPackage } from './auto-run-review';

const head = 'a'.repeat(40);
const passing = {
  __typename: 'CheckRun',
  name: 'quality',
  status: 'COMPLETED',
  conclusion: 'SUCCESS',
};
const pr = {
  number: 42,
  url: 'https://github.com/codethread/millstrand-ui/pull/42',
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  headRefName: 'auto/card',
  headRefOid: head,
  body: '## Summary\nChanged the UI.\n## Walkthrough\nC4 component view:\n```mermaid\nflowchart LR\n  UI --> API\n```\n## Verification\npnpm quality; browser checks.\n## Screenshots\nNot applicable: config-only change.',
  statusCheckRollup: [passing],
};

describe('automatic review handoff', () => {
  it('accepts a passing PR for the exact branch revision with a review package', () => {
    expect(verifyReviewPackage(pr, 'auto/card', head)).toEqual({
      pr: 42,
      url: pr.url,
      head,
      checks: 'passed',
    });
  });

  it.each([
    { headRefOid: 'b'.repeat(40) },
    { headRefName: 'other-branch' },
    { isDraft: true },
    { state: 'MERGED' },
    { baseRefName: 'other-base' },
    { statusCheckRollup: [] },
    { statusCheckRollup: [{ ...passing, status: 'IN_PROGRESS' }] },
    { statusCheckRollup: [{ ...passing, conclusion: 'FAILURE' }] },
    { statusCheckRollup: [{ ...passing, conclusion: 'SKIPPED' }] },
    {
      statusCheckRollup: [
        passing,
        { __typename: 'StatusContext', context: 'deploy', state: 'PENDING' },
      ],
    },
    { body: pr.body.replace('## Screenshots', '## Images') },
    { body: pr.body.replace('pnpm quality; browser checks.', '') },
    { body: pr.body.replace('```mermaid', '```text') },
    {
      body: pr.body
        .replace('## Walkthrough\nC4 component view:\n', '')
        .replace('## Verification', '## Walkthrough\nPlain text only.\n## Verification'),
    },
  ])('rejects a non-reviewable handoff: %j', (patch) => {
    expect(() => verifyReviewPackage({ ...pr, ...patch }, 'auto/card', head)).toThrow();
  });
});
