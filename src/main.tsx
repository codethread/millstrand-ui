import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  stripSearchParams,
} from '@tanstack/react-router';
import { TooltipProvider } from './components/ui/tooltip';
import { Dashboard } from './Dashboard';
import type { Presentation } from './store';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 3000 } } });
const rootRoute = createRootRoute();
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (
    search: Record<string, unknown>,
  ): { mode: Presentation; issue: string | null; workspace: string | null } => ({
    mode: search.mode === 'outline' || search.mode === 'graph' ? search.mode : 'board',
    issue: typeof search.issue === 'string' && search.issue ? search.issue : null,
    workspace: typeof search.workspace === 'string' && search.workspace ? search.workspace : null,
  }),
  search: { middlewares: [stripSearchParams({ mode: 'board', issue: null, workspace: null })] },
  component: Dashboard,
});
export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
