import { expect, it } from 'vitest';
import { commentDraftReducer, type CommentDraftState } from './review-comment-draft';

function opened() {
  const state = commentDraftReducer(
    { kind: 'closed' },
    { type: 'open', id: 'draft-1', text: 'Proposal' },
  );
  if (state.kind !== 'editing') throw new Error('Expected draft');
  return state;
}

it('retains unsaved edits when another proposal arrives or refresh attempts to reopen it', () => {
  const edited = commentDraftReducer(opened(), { type: 'edit', text: 'My edits' });
  expect(
    commentDraftReducer(edited, { type: 'open', id: 'draft-2', text: 'New server text' }),
  ).toBe(edited);
  expect(edited).toMatchObject({ draft: { text: 'My edits' } });
});

it('clears only the exact successfully adopted draft and retains edits made in flight', () => {
  const initial = opened();
  const changed = commentDraftReducer(initial, { type: 'edit', text: 'New edit' });
  expect(commentDraftReducer(changed, { type: 'adopted', submitted: initial.draft })).toBe(changed);
  expect(commentDraftReducer(initial, { type: 'adopted', submitted: initial.draft })).toEqual({
    kind: 'closed',
  });
});

it('does not clear a replacement draft when an earlier request succeeds', () => {
  const initial = opened();
  const discarded = commentDraftReducer(initial, { type: 'discard' });
  const replacement = commentDraftReducer(discarded, {
    type: 'open',
    id: 'draft-2',
    text: initial.draft.text,
  });
  expect(commentDraftReducer(replacement, { type: 'adopted', submitted: initial.draft })).toBe(
    replacement,
  );
});

it('retains a draft even when edits return to the submitted text', () => {
  const initial = opened();
  let state: CommentDraftState = commentDraftReducer(initial, { type: 'edit', text: 'Changed' });
  state = commentDraftReducer(state, { type: 'edit', text: initial.draft.text });
  expect(commentDraftReducer(state, { type: 'adopted', submitted: initial.draft })).toBe(state);
  expect(commentDraftReducer(state, { type: 'discard' })).toEqual({ kind: 'closed' });
});
