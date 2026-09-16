import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, RefreshCw, Search } from 'lucide-react';
import type { Board, WorkspaceOption } from '../../shared/api';
import { workspaceReaderOptions } from '../lib/api/workspaces';
import { matchingWorkspaces, selectedWorkspace } from '../lib/workspaces';
import { useDashboardActions, useWorkspaceId } from '../lib/navigation';
import { cn } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ErrorNotice, Loading } from './issue-parts';

const hasWorkspaces = (options: WorkspaceOption[]) => options.length > 0;

/** Health subscribes independently of the selected label and filtered option content. */
function DiscoveryStatus() {
  const query = useQuery({ ...workspaceReaderOptions(), select: hasWorkspaces });
  return (
    <>
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
      {query.isPending && <Loading text="Finding weavers…" />}
      {query.error && <ErrorNotice error={query.error} />}
      {query.error && query.data && (
        <p className="px-2 text-xs text-destructive">
          Discovery interrupted · showing last-known weavers.
        </p>
      )}
    </>
  );
}

function WorkspaceOptions({
  search,
  selectedId,
  onSelect,
}: {
  search: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const select = useCallback(
    (options: WorkspaceOption[]) => matchingWorkspaces(options, search),
    [search],
  );
  const { data: options } = useQuery({ ...workspaceReaderOptions(), select });
  return (
    <div className="workspace-options">
      {options?.map((option) => (
        <button
          key={option.id}
          className={cn('workspace-option', selectedId === option.id && 'selected')}
          onClick={() => onSelect(option.id)}
        >
          <span className={cn('weaver-status', option.status)} />
          <span>
            <strong>{option.name}</strong>
            <small title={option.path}>{option.path.replace(/\/\.millstrand$/, '')}</small>
          </span>
          {selectedId === option.id ? (
            <Check className="ml-auto size-3.5" />
          ) : (
            <small className="ml-auto">{option.status === 'running' ? 'Live' : 'Offline'}</small>
          )}
        </button>
      ))}
      {options?.length === 0 && <p className="detail-empty px-2 py-4">No matching workspaces.</p>}
    </div>
  );
}

export function WorkspaceSwitcher({ workspace }: { workspace: Board['workspace'] | null }) {
  const { selectWorkspace } = useDashboardActions();
  const workspaceId = useWorkspaceId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const fallbackPath = workspace?.path ?? null;
  const select = useCallback(
    (options: WorkspaceOption[]) => selectedWorkspace(options, workspaceId, fallbackPath),
    [workspaceId, fallbackPath],
  );
  const { data: selected } = useQuery({ ...workspaceReaderOptions(), select });
  const name = selected?.name ?? workspace?.name ?? 'Choose workspace';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="workspace-picker" aria-label={`Switch workspace, current ${name}`}>
          <span className="workspace-monogram">{name[0]?.toUpperCase()}</span>
          <span className="workspace-picker-text">
            <strong>{name}</strong>
            <small>Weaver workspace</small>
          </span>
          <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="workspace-menu">
        <DiscoveryStatus />
        <div className="workspace-menu-search">
          <Search className="size-3.5" />
          <Input
            aria-label="Find a workspace"
            placeholder="Find a workspace…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <WorkspaceOptions
          search={search}
          selectedId={selected?.id ?? null}
          onSelect={(id) => {
            setOpen(false);
            setSearch('');
            selectWorkspace(id);
          }}
        />
        <p className="workspace-menu-hint">Local weavers · selection stays in this browser</p>
      </PopoverContent>
    </Popover>
  );
}
