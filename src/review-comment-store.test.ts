import { beforeEach, expect, it, vi } from 'vitest';
import {
  reviewDraftKey,
  useReviewCommentStore,
  parseSavedCommentDraft,
} from './review-comment-store';

beforeEach(() => {
  useReviewCommentStore.setState({ drafts: {}, errors: {} });
  vi.unstubAllGlobals();
});
it('keeps unread A blocked after unrelated B save/discard and resolves errors only by key', () => {
  const data = new Map([
    ['a', '{broken'],
    ['c', '{broken'],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  const store = useReviewCommentStore.getState();
  store.load('a');
  store.load('c');
  store.open('b', 'Other draft', 1);
  store.discard('b');
  expect(useReviewCommentStore.getState().errors['a']?.kind).toBe('read');
  expect(data.get('a')).toBe('{broken');
  store.open('a', 'Must not overwrite unread data', 1);
  expect(data.get('a')).toBe('{broken');
  data.set(
    'a',
    JSON.stringify({
      candidateVersion: 1,
      state: {
        kind: 'editing',
        draft: { id: 'recovered', text: 'Recovered text', edit: 0 },
      },
    }),
  );
  store.retry('a');
  expect(useReviewCommentStore.getState().errors['a']).toBeUndefined();
  expect(useReviewCommentStore.getState().drafts['a']).toMatchObject({
    state: { draft: { text: 'Recovered text' } },
  });
  expect(useReviewCommentStore.getState().errors['c']?.kind).toBe('read');
  store.discard('c');
  expect(data.has('c')).toBe(false);
  expect(useReviewCommentStore.getState().errors['c']).toBeUndefined();
  expect(useReviewCommentStore.getState().drafts['a']?.state.kind).toBe('editing');
});

it('retains in-memory unsaved text when a read retry fails', () => {
  vi.stubGlobal('localStorage', {
    setItem: vi.fn(),
    getItem: () => {
      throw new Error('unavailable');
    },
  });
  const store = useReviewCommentStore.getState();
  store.open('a', 'Keep edits', 1);
  const draft = useReviewCommentStore.getState().drafts['a'];
  store.retry('a');
  expect(useReviewCommentStore.getState().drafts['a']).toEqual(draft);
  expect(useReviewCommentStore.getState().errors['a']?.kind).toBe('read');
});

it('clears only a successfully retried write error', () => {
  let failWrite = true;
  vi.stubGlobal('localStorage', {
    setItem: () => {
      if (failWrite) throw new Error('quota');
    },
  });
  const store = useReviewCommentStore.getState();
  store.open('a', 'A', 1);
  store.open('b', 'B', 1);
  failWrite = false;
  store.retry('a');
  expect(useReviewCommentStore.getState().errors['a']).toBeUndefined();
  expect(useReviewCommentStore.getState().errors['b']?.kind).toBe('write');
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
  expect(useReviewCommentStore.getState().errors['draft']?.message).toContain('could not be saved');
  expect(() =>
    parseSavedCommentDraft({
      state: { kind: 'editing', draft: { id: 3 } },
      candidateVersion: 0,
    }),
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
