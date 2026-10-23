import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ExternalRefs } from './external-refs';
import { TooltipProvider } from './ui/tooltip';

it('renders one new-tab link per reference, mixing tickets and pull requests', () => {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <ExternalRefs
        refs={[
          { url: 'https://acme.atlassian.net/browse/DL-1', label: 'DL-1' },
          { url: 'https://acme.atlassian.net/browse/DL-2', label: null },
          { url: 'https://git.example.io/team/app/-/merge_requests/7', label: 'API MR' },
          { url: 'https://github.com/team/ui/pull/9', label: null },
          { url: 'https://example.com/spec', label: null },
        ]}
      />
    </TooltipProvider>,
  );
  const links = [...html.matchAll(/<a [^>]*>/g)].map(([tag]) => ({
    href: /href="([^"]+)"/.exec(tag)?.[1],
    name: /aria-label="([^"]+)"/.exec(tag)?.[1],
    provider: /data-provider="([^"]+)"/.exec(tag)?.[1],
    newTab: tag.includes('target="_blank"') && tag.includes('rel="noreferrer"'),
  }));
  expect(links).toEqual([
    {
      href: 'https://acme.atlassian.net/browse/DL-1',
      name: 'DL-1',
      provider: 'jira',
      newTab: true,
    },
    {
      href: 'https://acme.atlassian.net/browse/DL-2',
      name: 'Jira DL-2',
      provider: 'jira',
      newTab: true,
    },
    {
      href: 'https://git.example.io/team/app/-/merge_requests/7',
      name: 'API MR',
      provider: 'gitlab',
      newTab: true,
    },
    {
      href: 'https://github.com/team/ui/pull/9',
      name: 'GitHub pull/9',
      provider: 'github',
      newTab: true,
    },
    {
      href: 'https://example.com/spec',
      name: 'Link spec',
      provider: 'link',
      newTab: true,
    },
  ]);
});

it('renders nothing without references', () => {
  expect(renderToStaticMarkup(<ExternalRefs refs={[]} />)).toBe('');
});
