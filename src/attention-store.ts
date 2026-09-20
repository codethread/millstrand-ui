import { create } from 'zustand';
import { z } from 'zod';
import { defaultAttentionLabels } from './lib/overview';

const storageKey = 'millstrand-ui-attention-labels';
const labelsSchema = z.compile(z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/)), { strict: true });

type AttentionEditor = { kind: 'closed' } | { kind: 'editing'; text: string; error: string | null };
interface AttentionState {
  labels: string[];
  loadError: string | null;
  editor: AttentionEditor;
  open: () => void;
  close: () => void;
  edit: (text: string) => void;
  save: () => void;
  refresh: () => void;
}

function readLabels(): string[] {
  if (typeof window === 'undefined') return defaultAttentionLabels;
  const saved = window.localStorage.getItem(storageKey);
  return saved === null ? defaultAttentionLabels : labelsSchema.parse(JSON.parse(saved) as unknown);
}

export const useAttentionStore = create<AttentionState>()((set, get) => {
  let labels = defaultAttentionLabels;
  let loadError: string | null = null;
  try {
    labels = readLabels();
  } catch {
    loadError =
      'Could not load attention labels. Showing defaults; open settings to save your choices.';
  }
  return {
    labels,
    loadError,
    editor: { kind: 'closed' },
    open: () => set({ editor: { kind: 'editing', text: get().labels.join(', '), error: null } }),
    close: () => set({ editor: { kind: 'closed' } }),
    edit: (text) => set({ editor: { kind: 'editing', text, error: null } }),
    save: () => {
      const editor = get().editor;
      if (editor.kind !== 'editing') return;
      const parsed = labelsSchema.safeParse([
        ...new Set(editor.text.split(/[,\s]+/).filter(Boolean)),
      ]);
      if (!parsed.success) {
        set({
          editor: {
            ...editor,
            error: 'Use lowercase label names with letters, numbers and hyphens.',
          },
        });
        return;
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(parsed.data));
        set({ labels: parsed.data, loadError: null, editor: { kind: 'closed' } });
      } catch {
        set({
          editor: {
            ...editor,
            error:
              'Could not save to this browser. Your draft is still here; enable local storage and try again.',
          },
        });
      }
    },
    refresh: () => {
      try {
        set({ labels: readLabels(), loadError: null });
      } catch {
        set({ loadError: 'Could not reload attention labels. Keeping your last choices.' });
      }
    },
  };
});

if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === storageKey) useAttentionStore.getState().refresh();
  });
