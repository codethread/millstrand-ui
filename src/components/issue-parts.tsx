import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Diamond,
  Layers,
  AlertCircle,
  LoaderCircle,
} from 'lucide-react';
import type { Card, Lane, TaskStatus } from '../../shared/api';
import { labelColor, lanes } from '../lib/board';
import { cn } from '../lib/utils';

export function StatusIcon({
  status,
  className,
}: {
  status: Lane | TaskStatus;
  className?: string;
}) {
  const Icon =
    status === 'closed'
      ? CircleCheck
      : status === 'claimed' || status === 'doing'
        ? CircleDot
        : status === 'in_review' || status === 'in_production'
          ? CircleDot
          : status === 'refinement'
            ? CircleDashed
            : status === 'blocked'
              ? AlertCircle
              : Circle;
  return (
    <Icon
      aria-hidden
      className={cn('size-3.5 shrink-0 status-icon', `status-${status}`, className)}
    />
  );
}
export function StatusBadge({ status }: { status: Lane }) {
  return (
    <span className={cn('status-badge', `status-${status}`)}>
      <StatusIcon status={status} />
      {lanes.find((lane) => lane.id === status)?.title}
    </span>
  );
}
export function TypeIcon({ type }: { type: Card['type'] }) {
  return type === 'epic' ? (
    <Layers className="size-3.5 text-violet-500" />
  ) : (
    <Diamond className="size-3.5 text-sky-500" />
  );
}
export function LabelPill({ label }: { label: string }) {
  return (
    <span className={cn('label-pill', `label-${labelColor(label)}`)}>
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
export function Avatar({ owner }: { owner: string | null }) {
  return owner ? (
    <span className="avatar" title={owner}>
      {owner.slice(0, 2).toUpperCase()}
    </span>
  ) : (
    <span className="avatar unassigned" title="Unassigned">
      –
    </span>
  );
}
export function Loading({ text = 'Loading workspace…' }: { text?: string }) {
  return (
    <output className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      {text}
    </output>
  );
}
export function ErrorNotice({ error }: { error: Error }) {
  return (
    <div role="alert" className="error-notice">
      <AlertCircle className="size-4 shrink-0" />
      <span>{error.message}</span>
    </div>
  );
}
