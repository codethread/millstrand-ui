import { useState } from 'react';
import { ChevronDown, MessageSquare } from 'lucide-react';
import type { Note, Task } from '../../shared/api';
import { useTaskNotes } from '../hooks/use-cards';
import { relativeTime } from '../lib/board';
import { cn } from '../lib/utils';
import { Markdown } from './markdown';
import { IssueAgents } from './agent-activity';
import { ErrorNotice, Loading, StatusIcon } from './issue-parts';

export function Notes({ notes }: { notes: Note[] }) {
  return notes.length ? (
    <div className="notes-timeline">
      {notes.map((note) => (
        <article className="note" key={note.id}>
          <span className="note-marker">
            <MessageSquare className="size-3" />
          </span>
          <header>
            <strong>{note.actor?.identity ?? 'Workspace note'}</strong>
            {note.kind && <span className="note-kind">{note.kind}</span>}
            <time title={note.at}>{relativeTime(note.at)}</time>
          </header>
          <Markdown text={note.text} />
          {note.truncated && (
            <p className="text-xs text-muted-foreground">This note was truncated at the source.</p>
          )}
        </article>
      ))}
    </div>
  ) : (
    <p className="detail-empty">No notes yet. Updates from agents will appear here.</p>
  );
}

export function TaskRow({ task, cardId }: { task: Task; cardId: string }) {
  const [open, setOpen] = useState(false);
  const notes = useTaskNotes(cardId, task.id, open);
  return (
    <div className="task-item">
      <button className="task-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <StatusIcon status={task.status} />
        <span>
          <strong>{task.title}</strong>
          <small>
            <span className="issue-id">{task.id}</span>
            <span className={cn('task-status', `status-${task.status}`)}>
              {task.status === 'closed' ? 'completed' : task.status}
            </span>
            {task.owner && <span>{task.owner}</span>}
          </small>
        </span>
        <ChevronDown
          className={cn(
            'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="task-expanded">
          <div className="mb-4">
            <IssueAgents owner={task.owner} target={task.id} />
          </div>
          {task.body ? (
            <Markdown text={task.body} />
          ) : (
            <p className="detail-empty">No task description.</p>
          )}
          <h4 className="detail-section-title">Task activity</h4>
          <TaskActivity notes={notes.data} error={notes.error} pending={notes.isPending} />
        </div>
      )}
    </div>
  );
}

export function TaskActivity({
  notes,
  error,
  pending,
}: {
  notes: Note[] | undefined;
  error: Error | null;
  pending: boolean;
}) {
  return (
    <>
      {error && <ErrorNotice error={error} />}
      {notes !== undefined ? (
        <>
          {error && <p className="detail-empty">Showing last-known task activity.</p>}
          <Notes notes={notes} />
        </>
      ) : pending ? (
        <Loading text="Loading notes…" />
      ) : null}
    </>
  );
}
