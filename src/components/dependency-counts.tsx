import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DependencyCounts } from '../../shared/api';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

function DependencyArrows({ counts }: { counts: DependencyCounts }) {
  return (
    <>
      <span className="inline-flex items-center gap-0.5">
        <ArrowUp className="size-3!" />
        {counts.outgoing}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <ArrowDown className="size-3!" />
        {counts.incoming}
      </span>
    </>
  );
}

/** Graph counts directly toggle the same explicit expansion as the context menu. */
export function GraphDependencyCounts({
  id,
  counts,
  expanded,
  onToggle,
}: {
  id: string;
  counts: DependencyCounts;
  expanded: boolean;
  onToggle: () => void;
}) {
  const action = expanded ? 'Hide' : 'Show';
  return (
    <Button
      variant="ghost"
      size="sm"
      className="nodrag nopan h-7 gap-2 border border-transparent px-1.5 text-xs tabular-nums text-muted-foreground aria-pressed:border-violet-500/50 aria-pressed:bg-violet-500/15 aria-pressed:text-violet-700 dark:aria-pressed:text-violet-300"
      aria-label={`${action} dependencies for ${id}: depends on ${counts.outgoing}, required by ${counts.incoming}`}
      aria-pressed={expanded}
      title={`↑ Depends on · ↓ Required by · ${action} direct dependencies`}
      disabled={!expanded && counts.incoming + counts.outgoing === 0}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <DependencyArrows counts={counts} />
    </Button>
  );
}

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
          <DependencyArrows counts={counts} />
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
