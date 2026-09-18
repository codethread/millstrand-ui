import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './lib/api/query-client';
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  stripSearchParams,
} from '@tanstack/react-router';
import { TooltipProvider } from './components/ui/tooltip';
import { Dashboard } from './Dashboard';
import { LogActivityOverlay } from './components/log-activity-overlay';
import { WorkspaceDiscovery } from './components/workspace-discovery';
import { dashboardSearchDefaults, parseDashboardSearch } from './lib/dashboard-search';
import './index.css';

function DashboardPreview() {
  return (
    <>
      <Dashboard />
      <LogActivityOverlay />
    </>
  );
}
const queryClient = createQueryClient();
const rootRoute = createRootRoute();
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: parseDashboardSearch,
  search: { middlewares: [stripSearchParams(dashboardSearchDefaults)] },
  component: DashboardPreview,
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
      <WorkspaceDiscovery />
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
