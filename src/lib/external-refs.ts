import type { ExternalRef } from '../../shared/api';

export type ExternalRefProvider = 'jira' | 'gitlab' | 'github' | 'link';

export const providerNames: Record<ExternalRefProvider, string> = {
  jira: 'Jira',
  gitlab: 'GitLab',
  github: 'GitHub',
  link: 'Link',
};

/** Simple URL matching; self-hosted GitLab is recognised by its `/-/` route prefix. */
export function externalRefProvider(url: string): ExternalRefProvider {
  const { hostname, pathname } = new URL(url);
  if (hostname.endsWith('.atlassian.net') || hostname.includes('jira')) return 'jira';
  if (hostname === 'github.com' || hostname.endsWith('.github.com')) return 'github';
  if (hostname.includes('gitlab') || pathname.includes('/-/')) return 'gitlab';
  return 'link';
}

/** Tooltip and accessible name: the label, else provider plus the issue key or trailing path. */
export function externalRefName(ref: ExternalRef): string {
  if (ref.label !== null) return ref.label;
  const provider = externalRefProvider(ref.url);
  const { hostname, pathname } = new URL(ref.url);
  const tail = pathname
    .split('/')
    .filter(Boolean)
    .slice(provider === 'jira' ? -1 : -2)
    .join('/');
  return `${providerNames[provider]} ${tail === '' ? hostname : tail}`;
}
