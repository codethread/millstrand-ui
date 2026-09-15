import { ChevronDown, Filter } from 'lucide-react';
import type { CardType, Priority } from '../../shared/api';
import { lanes } from '../lib/board';
import { useDashboardNavigation } from '../lib/navigation';
import { cn } from '../lib/utils';
import { StatusIcon } from './issue-parts';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export function DashboardFilters() {
  const nav = useDashboardNavigation();
  const count = nav.filter.lanes.length + nav.filter.types.length + nav.filter.priorities.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter />
          Filters{count > 0 && <span className="filter-count">{count}</span>}
          <ChevronDown className="size-3!" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="filter-popover">
          <strong>Refine this view</strong>
          <span className="filter-heading">STATUS</span>
          <div className="flex flex-wrap gap-1.5">
            {lanes
              .filter((lane) => lane.id !== 'unknown')
              .map((lane) => (
                <button
                  key={lane.id}
                  className={cn('filter-chip', nav.filter.lanes.includes(lane.id) && 'selected')}
                  onClick={() => nav.toggleLane(lane.id)}
                >
                  <StatusIcon status={lane.id} />
                  {lane.title}
                </button>
              ))}
          </div>
          <span className="filter-heading">TYPE</span>
          <div className="flex gap-1.5">
            {(['epic', 'feature'] satisfies CardType[]).map((type) => (
              <button
                key={type}
                className={cn(
                  'filter-chip capitalize',
                  nav.filter.types.includes(type) && 'selected',
                )}
                onClick={() => nav.toggleType(type)}
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
                  nav.filter.priorities.includes(priority) && 'selected',
                )}
                onClick={() => nav.togglePriority(priority)}
              >
                {priority}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={nav.resetFilters}>
            Reset filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
