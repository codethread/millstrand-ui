import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DependencyCounts } from '../../shared/api';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

/** Full workspace counts, including closed neighbours; never just the visible cards. */
export function CardDependencyCounts({ counts }: { counts: DependencyCounts }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-2 px-1.5 text-xs tabular-nums text-muted-foreground"
          aria-label={`Dependencies: depends on ${counts.outgoing}, required by ${counts.incoming}`}
          title="↑ Depends on · ↓ Required by"
        >
          <span className="inline-flex items-center gap-0.5">
            <ArrowUp className="size-3!" />
            {counts.outgoing}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <ArrowDown className="size-3!" />
            {counts.incoming}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1 text-xs" aria-label="Dependency counts">
        <p>
          <strong>↑ Depends on: {counts.outgoing}</strong>{' '}
          {counts.outgoing === 1 ? 'prerequisite' : 'prerequisites'}
        </p>
        <p>
          <strong>↓ Required by: {counts.incoming}</strong>{' '}
          {counts.incoming === 1 ? 'dependent' : 'dependents'}
        </p>
        <p className="pt-1 text-muted-foreground">
          Direct relationships across this workspace, including closed cards. Use the card’s graph
          menu to explore them.
        </p>
      </PopoverContent>
    </Popover>
  );
}
