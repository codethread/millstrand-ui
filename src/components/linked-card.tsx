import { ArrowUpRight, Link2, Link2Off } from 'lucide-react';
import type { CardLink } from '../../shared/api';
import { relativeTime } from '../lib/board';
import { useDashboardActions } from '../lib/navigation';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

function LinkDetails({ link }: { link: CardLink }) {
  const { openLinkedCard } = useDashboardActions();
  return (
    <>
      <p className="font-semibold">
        Mirrors {link.target.card} on {link.target.workspaceName}
      </p>
      <p className="text-muted-foreground [overflow-wrap:anywhere]">{link.target.workspace}</p>
      {link.status === 'live' ? (
        <p>Title, lane and owner are read live from that board.</p>
      ) : (
        <output className="block text-amber-800 dark:text-amber-200">
          Unavailable: {link.reason} Showing the stored mirror
          {link.observedAt === null
            ? ', which has no recorded observation.'
            : `, last observed ${relativeTime(link.observedAt)}.`}
        </output>
      )}
      <p className="text-muted-foreground">
        Labels, priority and notes here are coordinator annotations. Lane changes happen on the
        downstream board.
      </p>
      {link.status === 'live' && (
        <Button size="sm" onClick={() => openLinkedCard(link.target)}>
          <ArrowUpRight />
          Open on {link.target.workspaceName}
        </Button>
      )}
    </>
  );
}

/** Compact destination chip: always names the workspace and keeps unavailability visible. */
export function LinkedCardBadge({ link }: { link: CardLink }) {
  const live = link.status === 'live';
  const Icon = live ? Link2 : Link2Off;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-link-status={link.status}
          className={cn(
            'inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] hover:border-primary aria-expanded:border-primary max-sm:min-h-8',
            live
              ? 'border-primary/25 bg-accent text-accent-foreground'
              : 'border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
          )}
          aria-label={`Linked to ${link.target.card} on ${link.target.workspaceName}${live ? '' : ', unavailable'}`}
        >
          <Icon className="size-3 shrink-0" />
          <span className="truncate">{link.target.workspaceName}</span>
          {!live && <span>· stale</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Linked card details"
        className="w-80 max-w-[calc(100vw-24px)] space-y-2 text-xs [overflow-wrap:anywhere]"
      >
        <LinkDetails link={link} />
      </PopoverContent>
    </Popover>
  );
}

/** Mirror detail: the local strand lacks the downstream body, tasks and notes. */
export function LinkedCardNotice({ link }: { link: CardLink }) {
  return (
    <aside
      aria-label="Linked card"
      className={cn(
        'mx-5 mt-3 mb-2 space-y-2 rounded-lg border p-3 text-xs',
        link.status === 'live'
          ? 'border-primary/30 bg-accent/40'
          : 'border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/30',
      )}
    >
      <LinkDetails link={link} />
      <p className="text-muted-foreground">
        The description, tasks and agent notes live on the downstream card.
      </p>
    </aside>
  );
}
