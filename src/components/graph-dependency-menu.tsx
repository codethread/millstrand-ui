import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from './ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';

export interface DependencyAction {
  label: string;
  disabled: boolean;
  run: () => void;
}

export function GraphDependencyMenu({
  children,
  action,
}: {
  children: ReactNode;
  action: DependencyAction;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent onClick={(event) => event.stopPropagation()}>
        <ContextMenuItem disabled={action.disabled} onSelect={action.run}>
          {action.label}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function GraphDependencyButton({ id, action }: { id: string; action: DependencyAction }) {
  return (
    <div className="nodrag nopan">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Dependency actions for ${id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuItem disabled={action.disabled} onSelect={action.run}>
            {action.label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
