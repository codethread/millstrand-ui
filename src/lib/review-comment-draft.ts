export interface CommentDraft {
  /** Unique per editing session, never reused after discard or adoption. */
  id: string;
  text: string;
  /** Local edit sequence, unrelated to the upstream curation version. */
  edit: number;
}

export type CommentDraftState = { kind: 'closed' } | { kind: 'editing'; draft: CommentDraft };
export type CommentDraftAction =
  | { type: 'open'; id: string; text: string }
  | { type: 'edit'; text: string }
  | { type: 'discard' }
  | { type: 'adopted'; submitted: CommentDraft };

/** Refreshes/errors belong to server state and never replace an unsaved draft. */
export function commentDraftReducer(
  state: CommentDraftState,
  action: CommentDraftAction,
): CommentDraftState {
  switch (action.type) {
    case 'open':
      return state.kind === 'editing'
        ? state
        : { kind: 'editing', draft: { id: action.id, text: action.text, edit: 0 } };
    case 'edit':
      return state.kind === 'closed'
        ? state
        : {
            kind: 'editing',
            draft: { ...state.draft, text: action.text, edit: state.draft.edit + 1 },
          };
    case 'discard':
      return { kind: 'closed' };
    case 'adopted':
      return state.kind === 'editing' &&
        state.draft.id === action.submitted.id &&
        state.draft.edit === action.submitted.edit &&
        state.draft.text === action.submitted.text
        ? { kind: 'closed' }
        : state;
  }
}
