import type { SystemInfo, YamlConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';
import { loadTsConfig } from './tsConfigLoader';
import { loadYamlConfig } from './yamlConfigLoader';

/**
 * Loads configuration from either a YAML or TypeScript file.
 *
 * Automatically detects the file type based on extension and uses the appropriate loader.
 * Supports both `.yaml` and `.ts` configuration files with the same validation and
 * processing pipeline.
 *
 * @param parentLogger - Parent logger instance (a sublogger will be created).
 * @param fileSystem - File system interface for reading configuration files.
 * @param userConfigPath - Path to the user's configuration file (`.yaml` or `.ts`).
 * @param systemInfo - System information for platform detection and path expansion.
 * @param env - Environment variables for token substitution.
 * @returns A promise that resolves to the fully validated and processed configuration.
 *
 * @example
 * ```typescript
 * // Load YAML config
 * const config = await loadConfig(logger, fs, './config.yaml', systemInfo, env);
 *
 * // Load TypeScript config
 * const config = await loadConfig(logger, fs, './dotfiles.config.ts', systemInfo, env);
 * ```
 */
export async function loadConfig(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  userConfigPath: string,
  systemInfo: SystemInfo,
  env: Record<string, string | undefined>
): Promise<YamlConfig> {
  const logger = parentLogger.getSubLogger({ name: 'loadConfig' });

  if (userConfigPath.endsWith('.ts')) {
    logger.debug(messages.loadingTypeScriptConfiguration());
    return loadTsConfig(logger, fileSystem, userConfigPath, systemInfo, env);
  }

  if (userConfigPath.endsWith('.yaml') || userConfigPath.endsWith('.yml')) {
    logger.debug(messages.loadingYamlConfiguration());
    return loadYamlConfig(logger, fileSystem, userConfigPath, systemInfo, env);
  }

  throw new Error(`Unsupported configuration file type: ${userConfigPath}. Use .yaml, .yml, or .ts`);
}
