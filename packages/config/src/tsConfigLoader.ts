import fs from 'node:fs/promises';
import type { ISystemInfo, ProjectConfig, ProjectConfigPartial } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli } from '@dotfiles/utils';
import { messages } from './log-messages';
import { createProjectConfigFromObject } from './projectConfigLoader';

/**
 * Loads and validates configuration from a TypeScript file.
 *
 * Handles `.config.ts` files that export a `defineConfig` function or direct configuration object.
 * The function can be async or sync, providing the same flexibility as tool configurations.
 *
 * @param parentLogger - Parent logger instance (a sublogger will be created).
 * @param fileSystem - File system interface for checking file existence.
 * @param userConfigPath - Path to the user's TypeScript config file.
 * @param systemInfo - System information for platform detection and path expansion.
 * @param env - Environment variables for token substitution.
 * @returns A promise that resolves to the fully validated and processed configuration.
 *
 * @testing
 * For unit and integration tests, create a temporary TypeScript file with the config function
 * using `createMemFileSystem` or actual file system operations.
 */
export async function loadTsConfig(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  userConfigPath: string,
  systemInfo: ISystemInfo,
  env: Record<string, string | undefined>
): Promise<ProjectConfig> {
  const logger = parentLogger.getSubLogger({ name: 'loadTsConfig' });

  try {
    await fs.access(userConfigPath);
  } catch {
    logger.error(messages.fsItemNotFound('Config file', userConfigPath));
    exitCli(1);
  }

  let userConfig: ProjectConfigPartial = {};

  try {
    const module = await import(userConfigPath);

    if (!module.default) {
      logger.error(messages.configurationParseError(userConfigPath, 'TypeScript', 'no default export'));
      exitCli(1);
    }

    // Handle direct object export (from defineConfig which already executed the function)
    if (typeof module.default === 'object') {
      userConfig = module.default as ProjectConfigPartial;
    } else {
      logger.error(messages.configurationParseError(userConfigPath, 'TypeScript', 'default export must be an object'));
      exitCli(1);
    }
  } catch (error) {
    logger.error(
      messages.configurationParseError(
        userConfigPath,
        'TypeScript',
        error instanceof Error ? error.message : String(error)
      )
    );
    exitCli(1);
  }

  // Use the same processing pipeline as YAML config to ensure consistency
  // This handles merging, platform overrides, token substitution, and validation
  return createProjectConfigFromObject(logger, fileSystem, userConfig, systemInfo, env, { userConfigPath });
}
