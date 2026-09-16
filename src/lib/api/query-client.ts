import { QueryClient } from '@tanstack/react-query';

/** One client per application; tests can create isolated caches with the same defaults. */
export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 3000 } } });
}
