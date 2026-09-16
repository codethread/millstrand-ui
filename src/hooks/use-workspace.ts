import { useSearch } from '@tanstack/react-router';

export function useWorkspace() {
  return useSearch({ from: '/', select: (search) => search.workspace });
}
