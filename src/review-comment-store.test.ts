import { beforeEach, expect, it, vi } from 'vitest';
import {
  reviewDraftKey,
  useReviewCommentStore,
  parseSavedCommentDraft,
} from './review-comment-store';

beforeEach(() => {
  useReviewCommentStore.setState({ drafts: {}, error: null });
  vi.unstubAllGlobals();
});
it('persists unsaved text for reload and isolates review revisions and comments', () => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    setItem: (k: string, v: string) => data.set(k, v),
    getItem: (k: string) => data.get(k) ?? null,
  });
  const key = reviewDraftKey('workspace', 'review', 'revision', 'comment');
  useReviewCommentStore.getState().open(key, 'Proposal', 1);
  useReviewCommentStore.getState().edit(key, 'Unsaved edits');
  useReviewCommentStore.setState({ drafts: {} });
  useReviewCommentStore.getState().load(key);
  expect(useReviewCommentStore.getState().drafts[key]).toMatchObject({
    candidateVersion: 1,
    state: { kind: 'editing', draft: { text: 'Unsaved edits' } },
  });
  expect(reviewDraftKey('workspace', 'review', 'next-revision', 'comment')).not.toBe(key);
});
it('retains memory edits when persistence fails and rejects malformed persisted drafts', () => {
  vi.stubGlobal('localStorage', {
    setItem: () => {
      throw new Error('quota');
    },
  });
  useReviewCommentStore.getState().open('draft', 'Keep me', 1);
  expect(useReviewCommentStore.getState().drafts['draft']).toMatchObject({
    state: { draft: { text: 'Keep me' } },
  });
  expect(useReviewCommentStore.getState().error).toContain('could not be saved');
  expect(() =>
    parseSavedCommentDraft({ state: { kind: 'editing', draft: { id: 3 } }, candidateVersion: 0 }),
  ).toThrow();
});
it('explicitly rebases text to the new candidate and ignores an older adoption acknowledgment', () => {
  vi.stubGlobal('localStorage', { setItem: vi.fn() });
  const store = useReviewCommentStore.getState();
  store.open('draft', 'Preserve my words', 1);
  const before = useReviewCommentStore.getState().drafts['draft'];
  if (before?.state.kind !== 'editing') throw new Error('Missing draft');
  store.rebase('draft', 2);
  const after = useReviewCommentStore.getState().drafts['draft'];
  expect(after).toMatchObject({
    candidateVersion: 2,
    state: { draft: { text: 'Preserve my words' } },
  });
  if (after?.state.kind !== 'editing') throw new Error('Missing rebased draft');
  expect(after.state.draft.id).not.toBe(before.state.draft.id);
  store.adopted('draft', before.state.draft);
  expect(useReviewCommentStore.getState().drafts['draft']).toEqual(after);
  store.adopted('draft', after.state.draft);
  expect(useReviewCommentStore.getState().drafts['draft']?.state.kind).toBe('closed');
});
