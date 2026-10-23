import { expect, it } from 'vitest';
import { externalRefName, externalRefProvider } from './external-refs';

it.each([
  ['https://perkbox.atlassian.net/browse/DL-123', 'jira'],
  ['https://jira.example.com/browse/OPS-9', 'jira'],
  ['https://github.com/codethread/millstrand/pull/42', 'github'],
  ['https://gitlab.com/group/project/-/merge_requests/3', 'gitlab'],
  ['https://git.perkbox.io/app/deals-light-ui/-/merge_requests/881', 'gitlab'],
  ['https://example.com/docs/design', 'link'],
])('infers %s as %s', (url, provider) => {
  expect(externalRefProvider(url)).toBe(provider);
});

it('names a reference by its label, else by provider and trailing path', () => {
  const url = 'https://github.com/codethread/millstrand/pull/42';
  expect(externalRefName({ url, label: 'Core PR' })).toBe('Core PR');
  expect(externalRefName({ url, label: null })).toBe('GitHub pull/42');
  expect(externalRefName({ url: 'https://acme.atlassian.net/browse/DL-7', label: null })).toBe(
    'Jira DL-7',
  );
});
