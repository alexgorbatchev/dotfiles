import type { ISystemInfo, ProjectConfigPartial } from '@dotfiles/core';

/**
 * Context passed to the configuration factory function.
 */
export interface ConfigContext {
  /**
   * The directory containing the configuration file.
   */
  configFileDir: string;
  /**
   * Information about the current system (platform, architecture, etc.).
   */
  systemInfo: ISystemInfo;
}

export type ConfigFactory = (ctx: ConfigContext) => Promise<ProjectConfigPartial> | ProjectConfigPartial;

/**
 * Wraps a configuration factory so `.ts` config files stay fully typed.
 *
 * The factory can be synchronous or asynchronous and should return a {@link ProjectConfigPartial}.
 *
 * @param configFn - Configuration factory.
 * @returns The configuration factory function.
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
export function defineConfig(configFn: ConfigFactory): ConfigFactory {
  return configFn;
}
