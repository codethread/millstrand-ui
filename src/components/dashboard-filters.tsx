import { ChevronDown, Filter } from 'lucide-react';
import type { CardType, Priority } from '../../shared/api';
import { lanes } from '../lib/board';
import { useDashboardActions, useDashboardMode, useIssueFilter } from '../lib/navigation';
import { useBoardLabels } from '../hooks/use-cards';
import { cn } from '../lib/utils';
import { StatusIcon } from './issue-parts';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

function CompletedLabelFilters() {
  const labels = useBoardLabels();
  const filter = useIssueFilter();
  const actions = useDashboardActions();
  return (
    <>
      <span className="filter-heading">LABELS</span>
      <div className="flex gap-1.5" aria-label="Label matching">
        <Button
          variant={filter.mode === 'and' ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={filter.mode === 'and'}
          onClick={() => actions.setLabelMode('and')}
        >
          Match all
        </Button>
        <Button
          variant={filter.mode === 'or' ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={filter.mode === 'or'}
          onClick={() => actions.setLabelMode('or')}
        >
          Match any
        </Button>
      </div>
      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
        {(labels.data ?? []).map(({ label }) => (
          <button
            key={label}
            className={cn(
              'filter-chip max-w-full break-all',
              filter.terms[label] === 'include' && 'selected',
            )}
            aria-pressed={filter.terms[label] === 'include'}
            onClick={() => actions.toggleLabel(label)}
          >
            {label}
          </button>
        ))}
        {labels.data?.length === 0 && (
          <p className="text-xs text-muted-foreground">No labels in this workspace.</p>
        )}
      </div>
    </>
  );
}

export function DashboardFilters() {
  const filter = useIssueFilter();
  const actions = useDashboardActions();
  const completed = useDashboardMode() === 'completed';
  const count =
    (completed ? Object.keys(filter.terms).length : filter.lanes.length) +
    filter.types.length +
    filter.priorities.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter />
          Filters{count > 0 && <span className="filter-count">{count}</span>}
          <ChevronDown className="size-3!" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto"
      >
        <div className="filter-popover">
          <strong>Refine this view</strong>
          {!completed && (
            <>
              <span className="filter-heading">STATUS</span>
              <div className="flex flex-wrap gap-1.5">
                {lanes
                  .filter((lane) => lane.id !== 'unknown')
                  .map((lane) => (
                    <button
                      key={lane.id}
                      className={cn('filter-chip', filter.lanes.includes(lane.id) && 'selected')}
                      onClick={() => actions.toggleLane(lane.id)}
                    >
                      <StatusIcon status={lane.id} />
                      {lane.title}
                    </button>
                  ))}
              </div>
            </>
          )}
          <span className="filter-heading">TYPE</span>
          <div className="flex gap-1.5">
            {(['epic', 'feature'] satisfies CardType[]).map((type) => (
              <button
                key={type}
                className={cn('filter-chip capitalize', filter.types.includes(type) && 'selected')}
                aria-pressed={filter.types.includes(type)}
                onClick={() => actions.toggleType(type)}
              >
                {type}
              </button>
            ))}
          </div>
          <span className="filter-heading">PRIORITY</span>
          <div className="flex gap-1.5">
            {(['p1', 'p2', 'p3', 'p4'] satisfies Priority[]).map((priority) => (
              <button
                key={priority}
                className={cn(
                  'filter-chip uppercase',
                  filter.priorities.includes(priority) && 'selected',
                )}
                aria-pressed={filter.priorities.includes(priority)}
                onClick={() => actions.togglePriority(priority)}
              >
                {priority}
              </button>
            ))}
          </div>
          {completed && <CompletedLabelFilters />}
          <Button variant="ghost" size="sm" onClick={actions.resetFilters}>
            Reset filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
