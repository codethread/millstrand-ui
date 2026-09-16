export async function request<T>(
  path: string,
  workspace: string | null,
  init?: RequestInit,
): Promise<T> {
  const query = workspace ? `?workspace=${encodeURIComponent(workspace)}` : '';
  const response = await fetch(`/api${path}${query}`, init);
  if (!response.ok) {
    const body: unknown = await response.json();
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  // Fetch exposes JSON as `any`; endpoint contracts provide the type at this boundary.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return response.json() as Promise<T>;
}
