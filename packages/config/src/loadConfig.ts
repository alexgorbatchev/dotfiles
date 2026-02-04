import type { ISystemInfo, ProjectConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';
import { loadTsConfig } from './tsConfigLoader';

/**
 * Loads configuration from a TypeScript file.
 *
 * Configuration files must have a `.ts` extension and export a default configuration
 * object or function.
 *
 * @param parentLogger - Parent logger instance (a sublogger will be created).
 * @param fileSystem - File system interface for reading configuration files.
 * @param userConfigPath - Path to the user's TypeScript configuration file (`.ts`).
 * @param systemInfo - System information for platform detection and path expansion.
 * @param env - Environment variables for token substitution.
 * @returns A promise that resolves to the fully validated and processed configuration.
 *
 * @example
 * ```typescript
 * const config = await loadConfig(logger, fs, './dotfiles.config.ts', systemInfo, env);
 * ```
 */
export async function loadConfig(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  userConfigPath: string,
  systemInfo: ISystemInfo,
  env: Record<string, string | undefined>,
): Promise<ProjectConfig> {
  const logger = parentLogger.getSubLogger({ name: 'loadConfig' });

  if (userConfigPath.endsWith('.ts')) {
    logger.debug(messages.loadingTypeScriptConfiguration());
    return loadTsConfig(logger, fileSystem, userConfigPath, systemInfo, env);
  }

  throw new Error(`Unsupported configuration file type: ${userConfigPath}. Configuration must use .ts extension.`);
}
