import { useState } from 'react';
import { Check, ChevronDown, RefreshCw, Search } from 'lucide-react';
import type { Board } from '../../shared/api';
import { useWorkspaces } from '../lib/api';
import { useDashboardNavigation } from '../lib/navigation';
import { cn } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ErrorNotice, Loading } from './issue-parts';

export function WorkspaceSwitcher({ workspace }: { workspace: Board['workspace'] | null }) {
  const query = useWorkspaces();
  const nav = useDashboardNavigation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = query.data?.find((option) =>
    nav.workspace ? option.id === nav.workspace : option.path === workspace?.path,
  );
  const name = selected?.name ?? workspace?.name ?? 'Choose workspace';
  const options =
    query.data?.filter((option) =>
      `${option.name} ${option.path}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="workspace-picker" aria-label={`Switch workspace, current ${name}`}>
          <span className="workspace-monogram">{name[0]?.toUpperCase()}</span>
          <span className="workspace-picker-text">
            <strong>{name}</strong>
            <small>Kanban workspace</small>
          </span>
          <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="workspace-menu">
        <div className="workspace-menu-title">
          <strong>Switch workspace</strong>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh weavers"
            onClick={() => {
              void query.refetch();
            }}
          >
            <RefreshCw className={cn('size-3.5', query.isFetching && 'animate-spin')} />
          </Button>
        </div>
        <div className="workspace-menu-search">
          <Search className="size-3.5" />
          <Input
            aria-label="Find a workspace"
            placeholder="Find a workspace…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {query.isPending ? (
          <Loading text="Finding weavers…" />
        ) : query.error ? (
          <ErrorNotice error={query.error} />
        ) : (
          <div className="workspace-options">
            {options.map((option) => (
              <button
                key={option.id}
                className={cn('workspace-option', selected?.id === option.id && 'selected')}
                onClick={() => {
                  setOpen(false);
                  setSearch('');
                  nav.selectWorkspace(option.id);
                }}
              >
                <span className={cn('weaver-status', option.status)} />
                <span>
                  <strong>{option.name}</strong>
                  <small title={option.path}>{option.path.replace(/\/\.millstrand$/, '')}</small>
                </span>
                {selected?.id === option.id ? (
                  <Check className="ml-auto size-3.5" />
                ) : (
                  <small className="ml-auto">
                    {option.status === 'running' ? 'Live' : 'Offline'}
                  </small>
                )}
              </button>
            ))}
            {options.length === 0 && (
              <p className="detail-empty px-2 py-4">No matching workspaces.</p>
            )}
          </div>
        )}
        <p className="workspace-menu-hint">Local weavers · selection stays in this browser</p>
      </PopoverContent>
    </Popover>
  );
}
