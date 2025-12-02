import path from 'node:path';
import {
  Architecture,
  hasArchitecture,
  hasPlatform,
  type ISystemInfo,
  Platform,
  type ProjectConfig,
  type ProjectConfigPartial,
  privateProjectConfigFields,
  projectConfigSchema,
} from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli, expandHomePath } from '@dotfiles/utils';
import { z } from 'zod';
import { messages } from './log-messages';

/**
 * Detects the current operating system
 *
 * @param platform - The platform from NodeJS.Process
 * @returns The detected OS as a string ('macos', 'linux', or 'windows')
 */
function detectOS(platform: string): string {
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  if (platform === 'win32') return 'windows';
  return platform;
}

/**
 * Detects the current architecture
 * @param arch - The architecture from NodeJS.Process
 * @returns The detected architecture as a string ('x86_64' or 'arm64')
 */
function detectArch(arch: string): string {
  if (arch === 'x64') return 'x86_64';
  if (arch === 'arm64') return 'arm64';
  return arch;
}

/**
 * Platform match condition from config.yaml
 */
export interface IPlatformMatch {
  os?: 'macos' | 'linux' | 'windows';
  arch?: 'x86_64' | 'arm64';
}

/**
 * Platform override from config.yaml
 */
export interface IPlatformOverride {
  match: IPlatformMatch[];
  config: Record<string, unknown>;
}

/**
 * Deep merges two objects, with values from the second object overriding those in the first.
 * This function creates a new object and does not modify the original objects.
 *
 * @param target - The target object to merge into.
 * @param source - The source object to merge from.
 * @returns The merged object.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const output = { ...target } as Record<string, unknown>;

  for (const key in source) {
    if (source[key] === undefined) continue;

    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      output[key] = source[key];
    }
  }

  return output as T;
}

/**
 * Applies platform-specific overrides based on the current OS and architecture.
 *
 * @param config - The configuration object to apply overrides to.
 * @param systemInfo - System information for platform detection.
 * @returns The configuration with platform-specific overrides applied.
 */
function applyPlatformOverrides(
  parentLogger: TsLogger,
  config: Record<string, unknown>,
  systemInfo: ISystemInfo
): Record<string, unknown> {
  const logger = parentLogger.getSubLogger({ name: 'applyPlatformOverrides' });
  const platformOverrides = (config['platform'] as IPlatformOverride[]) || [];

  if (!Array.isArray(platformOverrides)) {
    return config;
  }

  const currentPlatform = detectOS(systemInfo.platform);
  const currentArch = detectArch(systemInfo.arch);

  logger.debug(messages.platformOverrides(currentPlatform, currentArch));

  let result: Record<string, unknown> = deepMerge({}, config);

  for (const platformOverride of platformOverrides) {
    if (!platformOverride.match || !Array.isArray(platformOverride.match) || !platformOverride.config) {
      continue;
    }

    const matches = platformOverride.match.some((match) => {
      const targetPlatform = match.os
        ? { macos: Platform.MacOS, linux: Platform.Linux, windows: Platform.Windows }[match.os] || Platform.None
        : Platform.None;

      const targetArch = match.arch
        ? { x86_64: Architecture.X86_64, arm64: Architecture.Arm64 }[match.arch] || Architecture.None
        : Architecture.None;

      const currentPlatformEnum =
        {
          macos: Platform.MacOS,
          linux: Platform.Linux,
          windows: Platform.Windows,
        }[currentPlatform] || Platform.None;

      const currentArchEnum =
        { x86_64: Architecture.X86_64, arm64: Architecture.Arm64 }[currentArch] || Architecture.None;

      const osMatches = !match.os || hasPlatform(targetPlatform, currentPlatformEnum);
      const archMatches = !match.arch || hasArchitecture(targetArch, currentArchEnum);
      return osMatches && archMatches;
    });

    if (matches) {
      result = deepMerge(result, platformOverride.config);
    }
  }

  delete result['platform'];
  return result;
}

/**
 * Recursively processes an object to expand home paths in string values.
 *
 * @param target - The object to process.
 * @param systemInfo - System information containing the home directory.
 * @returns The object with home paths expanded.
 */
function expandHomePathsInObject(target: unknown, homeDir: string): unknown {
  if (typeof target === 'string') {
    return expandHomePath(homeDir, target);
  }

  if (Array.isArray(target)) {
    return target.map((item) => expandHomePathsInObject(item, homeDir));
  }

  if (typeof target === 'object' && target) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(target)) {
      result[key] = expandHomePathsInObject(value, homeDir);
    }
    return result;
  }

  return target;
}

function resolveNestedConfigValue(varName: string, fullConfig: Record<string, unknown>): string | null {
  const parts = varName.split('.');
  let value: unknown = fullConfig;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  return typeof value === 'string' ? value : null;
}

function replaceConfigTokens(
  configStr: string,
  finalEnv: Record<string, string | undefined>,
  fullConfig: Record<string, unknown>
): string {
  return configStr.replace(/(?<!\$)\{([a-zA-Z0-9_.]+)\}/g, (match, varName) => {
    if (varName.includes('.')) {
      const resolvedValue = resolveNestedConfigValue(varName, fullConfig);
      return resolvedValue !== null ? resolvedValue : match;
    }

    const envValue = finalEnv[varName];
    return envValue !== undefined ? envValue : match;
  });
}

function performTokenSubstitution(
  configStr: string,
  finalEnv: Record<string, string | undefined>,
  fullConfig: Record<string, unknown>
): string {
  let currentConfigStr = configStr;
  let previousConfigStr = '';

  while (previousConfigStr !== currentConfigStr) {
    previousConfigStr = currentConfigStr;
    currentConfigStr = replaceConfigTokens(currentConfigStr, finalEnv, fullConfig);
  }

  return currentConfigStr;
}

/**
 * Type guard to check if a config object has a valid userConfigPath string property.
 *
 * @param config - The configuration object to check
 * @returns True if the config has a userConfigPath string property
 */
function hasConfigFilePath(
  config: Record<string, unknown>
): config is Record<string, unknown> & { configFilePath: string } {
  return typeof (config as ProjectConfig).configFilePath === 'string';
}

/**
 * Substitutes tokens in the configuration with values from environment variables and other config values.
 * Also expands home paths (~ character) in string values.
 *
 * @param config - The configuration object to substitute tokens in.
 * @param env - Environment variables for substitution.
 * @param fullConfig - The full configuration object for reference substitution.
 * @param systemInfo - System information containing the home directory.
 * @returns The configuration with tokens substituted and home paths expanded.
 */
function substituteTokens(
  config: Record<string, unknown>,
  env: Record<string, string | undefined>,
  fullConfig: Record<string, unknown>,
  systemInfo: ISystemInfo
): Record<string, unknown> {
  const configFileDir =
    hasConfigFilePath(fullConfig) && fullConfig.configFilePath
      ? path.dirname(fullConfig.configFilePath)
      : systemInfo.homeDir;

  const finalEnv = deepMerge(env, { HOME: systemInfo.homeDir, configFileDir });
  const configStr = Bun.YAML.stringify(config);
  const substitutedConfigStr = performTokenSubstitution(configStr, finalEnv, fullConfig);

  // Parse the config string back to an object
  const parsedConfig = Bun.YAML.parse(substitutedConfigStr) as Record<string, unknown>;

  // Expand home paths in the config
  const userConfigPath = hasConfigFilePath(fullConfig) ? fullConfig.configFilePath : undefined;
  const baseDir = userConfigPath ? path.dirname(userConfigPath) : systemInfo.homeDir;

  return expandHomePathsInObject(parsedConfig, baseDir) as Record<string, unknown>;
}

function processConfig(
  parentLogger: TsLogger,
  userConfigPath: string,
  defaultConfig: Record<string, unknown>,
  userConfig: Record<string, unknown>,
  systemInfo: ISystemInfo,
  env: Record<string, string | undefined>
): ProjectConfig {
  const logger = parentLogger.getSubLogger({ name: 'processConfig' });
  logger.debug(messages.configurationProcessing(), userConfigPath);

  const mergedConfig = deepMerge(defaultConfig, userConfig);
  const configWithPlatformOverrides = applyPlatformOverrides(parentLogger, mergedConfig, systemInfo);
  const withInjectedValues: ProjectConfig = configWithPlatformOverrides as ProjectConfig;

  withInjectedValues.configFilePath = userConfigPath;
  withInjectedValues.configFileDir = path.dirname(userConfigPath);

  const configWithTokens = substituteTokens(withInjectedValues, env, withInjectedValues, systemInfo);
  const result = projectConfigSchema.extend(privateProjectConfigFields.shape).safeParse(configWithTokens);

  if (!result.success) {
    const pretty = z.prettifyError(result.error);
    logger.error(messages.configurationValidationFailed([pretty]));
    throw new Error(`Project configuration is invalid.\n${pretty}`);
  }

  return result.data;
}

export async function getDefaultConfig(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  systemInfo: ISystemInfo,
  env: Record<string, string | undefined>,
  userConfigPath: string
): Promise<ProjectConfig> {
  const defaultConfig = await loadDefaultProjectConfigAsRecord(fileSystem);
  return processConfig(parentLogger, userConfigPath, defaultConfig, {}, systemInfo, env);
}

/**
 * Loads the default project configuration as a plain object.
 *
 * Returns the default configuration defined by the projectConfigSchema. This serves as the
 * base configuration that user configurations merge into.
 *
 * @param _fileSystem - File system interface (currently unused, kept for API consistency).
 * @returns A promise that resolves to the default configuration object.
 */
export async function loadDefaultProjectConfigAsRecord(_fileSystem: IFileSystem): Promise<Record<string, unknown>> {
  return projectConfigSchema.parse({});
}

/**
 * Loads and validates the project configuration from the filesystem.
 *
 * Reads the user's configuration file, merges it with default configuration, applies
 * platform-specific overrides based on the current system, and performs token substitution
 * for environment variables and config references.
 *
 * @param parentLogger - Parent logger instance (a sublogger will be created).
 * @param fileSystem - File system interface for reading configuration files.
 * @param userConfigPath - Path to the user's `config.yaml` file.
 * @param systemInfo - System information for platform detection and path expansion.
 * @param env - Environment variables for token substitution.
 * @param options - Additional options for configuration processing.
 * @param options.userConfigPath - File path to associate with the in-memory configuration for token substitution. Required.
 * @returns A promise that resolves to the fully validated and processed project configuration.
 *
 * @testing
 * For unit and integration tests, use `createMemFileSystem` (from `@dotfiles/testing-helpers`)
 * to create an in-memory file system with mock configuration files.
 */
export async function loadProjectConfig(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  userConfigPath: string,
  systemInfo: ISystemInfo,
  env: Record<string, string | undefined>
): Promise<ProjectConfig> {
  const logger = parentLogger.getSubLogger({ name: 'loadProjectConfig' });
  const defaultConfig = await loadDefaultProjectConfigAsRecord(fileSystem);
  let userConfig = {};

  if (!(await fileSystem.exists(userConfigPath))) {
    logger.error(messages.fsItemNotFound('Config file', userConfigPath));
    exitCli(1);
  }

  try {
    const userConfigContent = await fileSystem.readFile(userConfigPath, 'utf-8');
    userConfig = Bun.YAML.parse(userConfigContent) || {};
  } catch (error) {
    logger.error(
      messages.configurationParseError(userConfigPath, 'YAML', error instanceof Error ? error.message : String(error))
    );
  }

  return processConfig(parentLogger, userConfigPath, defaultConfig, userConfig, systemInfo, env);
}

export interface ICreateProjectConfigFromObjectOptions {
  userConfigPath: string;
}

/**
 * Creates a validated project configuration from in-memory objects.
 *
 * Useful for testing or programmatic configuration creation. Merges the user configuration
 * with default configuration, applies platform overrides, and performs token substitution,
 * but does not read from the filesystem.
 *
 * The associated file path must be provided via {@link ICreateProjectConfigFromObjectOptions.userConfigPath}
 * so token substitution and relative path resolution behave the same as when loading from disk.
 *
 * @param parentLogger - Parent logger instance (a sublogger will be created).
 * @param fileSystem - File system interface (used to load default config).
 * @param userConfig - User configuration object that overrides default values.
 * @param systemInfo - System information for platform detection and path expansion.
 * @param env - Environment variables for token substitution.
 * @returns A promise that resolves to the fully validated and processed project configuration.
 *
 * @testing
 * When writing tests, use `createMockProjectConfig` (from `@dotfiles/testing-helpers`) to create
 * a mock configuration object with sensible defaults.
 */
export async function createProjectConfigFromObject(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  userConfig: ProjectConfigPartial = {},
  systemInfo: ISystemInfo = { platform: 'darwin', arch: 'x64', homeDir: '/Users/testuser' },
  env: Record<string, string | undefined> = {},
  options: ICreateProjectConfigFromObjectOptions
): Promise<ProjectConfig> {
  const resolvedUserConfigPath: string = options.userConfigPath;
  const defaultConfig = await loadDefaultProjectConfigAsRecord(fileSystem);
  const userConfigClone = deepMerge({} as ProjectConfigPartial, userConfig);
  return processConfig(parentLogger, resolvedUserConfigPath, defaultConfig, userConfigClone, systemInfo, env);
}
