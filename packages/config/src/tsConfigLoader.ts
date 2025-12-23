import path from 'node:path';
import type { ISystemInfo, ProjectConfig, ProjectConfigPartial } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli } from '@dotfiles/utils';
import type { ConfigContext } from './defineConfig';
import { messages } from './log-messages';
import { createProjectConfigFromObject } from './stagedProjectConfigLoader';

type ModuleWithDefaultExport = {
  default?: unknown;
};

type ConfigFactory = (ctx: ConfigContext) => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasDefaultExport(value: unknown): value is ModuleWithDefaultExport {
  if (!isRecord(value)) {
    return false;
  }

  return 'default' in value;
}

function isConfigFactory(value: unknown): value is ConfigFactory {
  return typeof value === 'function';
}

function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}

function toProjectConfigPartial(value: Record<string, unknown>): ProjectConfigPartial {
  const result: ProjectConfigPartial = {};
  Object.assign(result, value);
  return result;
}

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
 */
export async function loadTsConfig(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  userConfigPath: string,
  systemInfo: ISystemInfo,
  env: Record<string, string | undefined>
): Promise<ProjectConfig> {
  const logger = parentLogger.getSubLogger({ name: 'loadTsConfig' });

  if (!(await fileSystem.exists(userConfigPath))) {
    logger.error(messages.fsItemNotFound('Config file', userConfigPath));
    exitCli(1);
  }

  let userConfig: ProjectConfigPartial = {};

  try {
    const importedModule: unknown = await import(userConfigPath);

    if (!hasDefaultExport(importedModule) || !importedModule.default) {
      logger.error(messages.configurationParseError(userConfigPath, 'TypeScript', 'no default export'));
      exitCli(1);
    }

    const configFileDir = path.dirname(userConfigPath);
    const ctx: ConfigContext = { configFileDir, systemInfo };

    const defaultExport: unknown = importedModule.default;
    const configValue: unknown = isConfigFactory(defaultExport) ? defaultExport(ctx) : defaultExport;

    const resolvedConfigValue: unknown = isPromise(configValue) ? await configValue : configValue;

    if (isRecord(resolvedConfigValue)) {
      userConfig = toProjectConfigPartial(resolvedConfigValue);
    } else {
      logger.error(
        messages.configurationParseError(
          userConfigPath,
          'TypeScript',
          'default export must be an object, function or Promise'
        )
      );
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
