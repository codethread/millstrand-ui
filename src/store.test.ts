import { beforeEach, describe, expect, it } from 'vitest';
import { emptyFilter } from './lib/board';
import { defaultShortcuts, useDashboardStore } from './store';

beforeEach(() => {
  useDashboardStore.setState({
    overlay: { kind: 'closed' },
    sidebarOpen: false,
    contentFullscreen: false,
    shortcuts: defaultShortcuts,
  });
});

describe('dashboard interaction workflows', () => {
  it('keeps saved-view edits in an isolated browser draft until save', () => {
    const filter = emptyFilter();
    filter.terms.platform = 'include';

    useDashboardStore.getState().editView(null, filter);
    filter.terms.platform = 'exclude';
    useDashboardStore.getState().renameDraft('Platform');
    useDashboardStore.getState().setDraftMode('or');
    useDashboardStore.getState().setDraftTerm('backend', 'exclude');

    expect(useDashboardStore.getState().overlay).toEqual({
      kind: 'view',
      id: null,
      name: 'Platform',
      filter: {
        ...emptyFilter(),
        mode: 'or',
        terms: { platform: 'include', backend: 'exclude' },
      },
    });
  });

  it('closes workspace-scoped interaction without changing browser preferences', () => {
    useDashboardStore.setState({ sidebarOpen: true, contentFullscreen: true });
    useDashboardStore.getState().openShortcuts();
    useDashboardStore.getState().setShortcut('search', 'ctrl+k');

    useDashboardStore.getState().resetWorkspace();

    expect(useDashboardStore.getState()).toMatchObject({
      overlay: { kind: 'closed' },
      sidebarOpen: false,
      contentFullscreen: true,
      shortcuts: { ...defaultShortcuts, search: 'ctrl+k' },
    });
  });

  it('exits the mobile sidebar when content enters or leaves fullscreen', () => {
    useDashboardStore.setState({ sidebarOpen: true });
    useDashboardStore.getState().setContentFullscreen(true);
    expect(useDashboardStore.getState()).toMatchObject({
      sidebarOpen: false,
      contentFullscreen: true,
    });
  });
});
