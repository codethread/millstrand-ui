/** Local dashboard defaults, keyed by the registry's stable workspace ID. */
export function parseAgentPreferences(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([workspace, alias]) =>
        /^[a-f0-9]{24}$/.test(workspace) &&
        typeof alias === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(alias),
    ),
  );
}
