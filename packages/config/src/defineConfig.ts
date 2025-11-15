import type { ProjectConfigPartial } from '@dotfiles/core';

/**
 * Wraps a configuration factory so `.ts` config files stay fully typed.
 *
 * The factory can be synchronous or asynchronous and should return a {@link ProjectConfigPartial}.
 * The wrapper executes the factory immediately and normalises the result to a promise so the
 * loader has a consistent async contract.
 *
 * @param configFn - Configuration factory executed exactly once when the file is imported.
 * @returns Promise that resolves with the user supplied configuration fragment.
 *
 * @example Asynchronous factory
 * ```typescript
 * export default defineConfig(async () => ({
 *   github: {
 *     token: await fetchToken(),
 *   },
 * }));
 * ```
 *
 * @example Synchronous factory
 * ```typescript
 * export default defineConfig(() => ({
 *   paths: {
 *     dotfilesDir: '~/.dotfiles',
 *     targetDir: '~/.local/bin',
 *   },
 * }));
 * ```
 */
export function defineConfig(
  configFn: () => Promise<ProjectConfigPartial> | ProjectConfigPartial
): Promise<ProjectConfigPartial> {
  const results = configFn();
  if (results instanceof Promise) {
    return results;
  }
  return Promise.resolve(results);
}
