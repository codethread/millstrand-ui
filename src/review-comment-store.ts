import { create } from 'zustand';
import {
  commentDraftReducer,
  type CommentDraft,
  type CommentDraftState,
} from './lib/review-comment-draft';

interface SavedDraft {
  state: CommentDraftState;
  candidateVersion: number;
}
interface DraftStore {
  drafts: Record<string, SavedDraft>;
  errors: Record<string, { kind: 'read' | 'write'; message: string }>;
  load: (key: string) => void;
  retry: (key: string) => void;
  open: (key: string, text: string, version: number) => void;
  edit: (key: string, text: string) => void;
  discard: (key: string) => void;
  adopted: (key: string, submitted: CommentDraft) => void;
  rebase: (key: string, version: number) => void;
  focus: { reviewId: string; commentId: string } | null;
  focusComment: (target: { reviewId: string; commentId: string } | null) => void;
}

export function reviewDraftKey(
  workspace: string,
  review: string,
  revision: string,
  comment: string,
): string {
  return `millstrand-review-draft:v1:${JSON.stringify([workspace, review, revision, comment])}`;
}

export function parseSavedCommentDraft(value: unknown): SavedDraft {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('candidateVersion' in value) ||
    !('state' in value)
  )
    throw new Error('Invalid saved draft');
  if (
    typeof value.candidateVersion !== 'number' ||
    !Number.isSafeInteger(value.candidateVersion) ||
    value.candidateVersion < 1
  )
    throw new Error('Invalid draft version');
  const state = value.state;
  if (typeof state !== 'object' || state === null || !('kind' in state))
    throw new Error('Invalid draft state');
  if (state.kind === 'closed')
    return {
      state: { kind: 'closed' },
      candidateVersion: value.candidateVersion,
    };
  if (state.kind !== 'editing' || !('draft' in state)) throw new Error('Invalid draft state');
  const draft = state.draft;
  if (
    typeof draft !== 'object' ||
    draft === null ||
    !('id' in draft) ||
    !('text' in draft) ||
    !('edit' in draft) ||
    typeof draft.id !== 'string' ||
    typeof draft.text !== 'string' ||
    typeof draft.edit !== 'number' ||
    !Number.isSafeInteger(draft.edit) ||
    draft.edit < 0
  )
    throw new Error('Invalid draft');
  return {
    state: {
      kind: 'editing',
      draft: { id: draft.id, text: draft.text, edit: draft.edit },
    },
    candidateVersion: value.candidateVersion,
  };
}

function newDraft(text: string): CommentDraftState {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return commentDraftReducer(
    { kind: 'closed' },
    {
      type: 'open',
      id: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      text,
    },
  );
}

export const useReviewCommentStore = create<DraftStore>((set, get) => {
  function clearError(key: string) {
    set((s) => {
      const errors = { ...s.errors };
      delete errors[key];
      return { errors };
    });
  }
  function fail(key: string, kind: 'read' | 'write', message: string) {
    set((s) => ({ errors: { ...s.errors, [key]: { kind, message } } }));
  }
  function read(key: string) {
    try {
      const raw = localStorage.getItem(key);
      const draft = raw === null ? null : parseSavedCommentDraft(JSON.parse(raw));
      if (draft !== null && !get().drafts[key])
        set((s) => ({ drafts: { ...s.drafts, [key]: draft } }));
      clearError(key);
    } catch {
      fail(key, 'read', 'Saved draft could not be read. Existing in-memory edits are retained.');
    }
  }
  function save(key: string, draft: SavedDraft) {
    set((s) => ({ drafts: { ...s.drafts, [key]: draft } }));
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      clearError(key);
    } catch {
      fail(
        key,
        'write',
        'Draft could not be saved in this browser. Keep this page open or copy your edits.',
      );
    }
  }
  return {
    drafts: {},
    errors: {},
    focus: null,
    focusComment: (focus) => set({ focus }),
    rebase: (key, version) => {
      const existing = get().drafts[key];
      if (existing?.state.kind === 'editing')
        save(key, {
          candidateVersion: version,
          state: newDraft(existing.state.draft.text),
        });
    },
    load: (key) => {
      if (get().drafts[key]) return;
      read(key);
    },
    retry: (key) => {
      const draft = get().drafts[key];
      if (get().errors[key]?.kind === 'write' && draft) save(key, draft);
      else read(key);
    },
    open: (key, text, version) => {
      if (get().errors[key]?.kind === 'read') return;
      const existing = get().drafts[key];
      if (existing?.state.kind === 'editing') return;
      save(key, {
        candidateVersion: version,
        state: newDraft(text),
      });
    },
    edit: (key, text) => {
      const draft = get().drafts[key];
      if (draft)
        save(key, {
          ...draft,
          state: commentDraftReducer(draft.state, { type: 'edit', text }),
        });
    },
    discard: (key) => {
      const draft = get().drafts[key];
      if (draft) save(key, { ...draft, state: { kind: 'closed' } });
      else {
        try {
          localStorage.removeItem(key);
          clearError(key);
        } catch {
          fail(
            key,
            'read',
            'Saved draft could not be discarded. Retry or copy its stored data before continuing.',
          );
        }
      }
    },
    adopted: (key, submitted) => {
      const draft = get().drafts[key];
      if (draft)
        save(key, {
          ...draft,
          state: commentDraftReducer(draft.state, {
            type: 'adopted',
            submitted,
          }),
        });
    },
  };
});
