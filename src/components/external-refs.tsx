import type { ComponentType, SVGProps } from 'react';
import { Link } from 'lucide-react';
import type { ExternalRef } from '../../shared/api';
import {
  externalRefName,
  externalRefProvider,
  type ExternalRefProvider,
} from '../lib/external-refs';
import { GitHubLogo, GitLabLogo, JiraLogo } from './provider-logos';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const providerIcons: Record<ExternalRefProvider, ComponentType<SVGProps<SVGSVGElement>>> = {
  jira: JiraLogo,
  gitlab: GitLabLogo,
  github: GitHubLogo,
  link: Link,
};

export function ExternalRefs({ refs }: { refs: ExternalRef[] }) {
  if (refs.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-0.5" aria-label="External references">
      {refs.map((ref, index) => {
        const Icon = providerIcons[externalRefProvider(ref.url)];
        const name = externalRefName(ref);
        return (
          // URLs may repeat with different labels, so the position disambiguates.
          <li key={`${index}:${ref.url}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={name}
                  data-provider={externalRefProvider(ref.url)}
                  className="inline-flex size-7 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-primary max-sm:size-8"
                >
                  <Icon className="size-3.5" aria-hidden />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{name}</p>
                <p className="opacity-75 [overflow-wrap:anywhere]">{ref.url}</p>
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
