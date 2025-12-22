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

type UnknownRecord = Record<string, unknown>;

const EMPTY_RECORD: UnknownRecord = {};

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isError(value: unknown): value is Error {
  return value instanceof Error;
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapNodePlatformToConfigOs(platform: string): string {
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  if (platform === 'win32') return 'windows';
  return platform;
}

function mapNodeArchToConfigArch(arch: string): string {
  if (arch === 'x64') return 'x86_64';
  if (arch === 'arm64') return 'arm64';
  return arch;
}

function mapConfigOsToPlatform(configOs: unknown): Platform {
  if (!isString(configOs)) {
    return Platform.None;
  }

  if (configOs === 'macos') return Platform.MacOS;
  if (configOs === 'linux') return Platform.Linux;
  if (configOs === 'windows') return Platform.Windows;

  return Platform.None;
}

function mapConfigArchToArchitecture(configArch: unknown): Architecture {
  if (!isString(configArch)) {
    return Architecture.None;
  }

  if (configArch === 'x86_64') return Architecture.X86_64;
  if (configArch === 'arm64') return Architecture.Arm64;

  return Architecture.None;
}

/**
 * Detects the current operating system
 *
 * @param platform - The platform from NodeJS.Process
 * @returns The detected OS as a string ('macos', 'linux', or 'windows')
 */
function detectOS(platform: string): string {
  return mapNodePlatformToConfigOs(platform);
}

/**
 * Detects the current architecture
 * @param arch - The architecture from NodeJS.Process
 * @returns The detected architecture as a string ('x86_64' or 'arm64')
 */
function detectArch(arch: string): string {
  return mapNodeArchToConfigArch(arch);
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
function deepMerge(target: unknown, source: unknown): UnknownRecord {
  const targetRecord = isPlainRecord(target) ? target : EMPTY_RECORD;
  const sourceRecord = isPlainRecord(source) ? source : EMPTY_RECORD;

  const output: UnknownRecord = { ...targetRecord };

  for (const [key, sourceValue] of Object.entries(sourceRecord)) {
    if (sourceValue === undefined) {
      continue;
    }

    const targetValue = output[key];

    if (isPlainRecord(targetValue) && isPlainRecord(sourceValue)) {
      output[key] = deepMerge(targetValue, sourceValue);
      continue;
    }

    output[key] = sourceValue;
  }

  return output;
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
  const platformOverridesValue: unknown = config['platform'];

  if (!Array.isArray(platformOverridesValue)) {
    return config;
  }

  const currentPlatform = detectOS(systemInfo.platform);
  const currentArch = detectArch(systemInfo.arch);

  logger.debug(messages.platformOverrides(currentPlatform, currentArch));

  let result: UnknownRecord = deepMerge(EMPTY_RECORD, config);

  for (const platformOverrideValue of platformOverridesValue) {
    if (!isPlainRecord(platformOverrideValue)) {
      continue;
    }

    const matchValue: unknown = platformOverrideValue['match'];
    const overrideConfigValue: unknown = platformOverrideValue['config'];

    if (!Array.isArray(matchValue) || !isPlainRecord(overrideConfigValue)) {
      continue;
    }

    const currentPlatformEnum = mapConfigOsToPlatform(currentPlatform);
    const currentArchEnum = mapConfigArchToArchitecture(currentArch);

    const matches = matchValue.some((matchEntry) => {
      if (!isPlainRecord(matchEntry)) {
        return false;
      }

      const matchOsValue: unknown = matchEntry['os'];
      const matchArchValue: unknown = matchEntry['arch'];

      const hasOsConstraint = isString(matchOsValue);
      const hasArchConstraint = isString(matchArchValue);

      const targetPlatform = mapConfigOsToPlatform(matchOsValue);
      const targetArch = mapConfigArchToArchitecture(matchArchValue);

      const osMatches = !hasOsConstraint || hasPlatform(targetPlatform, currentPlatformEnum);
      const archMatches = !hasArchConstraint || hasArchitecture(targetArch, currentArchEnum);
      return osMatches && archMatches;
    });

    if (matches) {
      result = deepMerge(result, overrideConfigValue);
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
    if (!isPlainRecord(value)) {
      return null;
    }

    if (!(part in value)) {
      return null;
    }

    value = value[part];
  }

  return isString(value) ? value : null;
}

function replaceConfigTokens(
  configStr: string,
  finalEnv: Record<string, unknown>,
  fullConfig: Record<string, unknown>
): string {
  return configStr.replace(/(?<!\$)\{([a-zA-Z0-9_.]+)\}/g, (match, varName) => {
    if (varName.includes('.')) {
      const resolvedValue = resolveNestedConfigValue(varName, fullConfig);
      return resolvedValue !== null ? resolvedValue : match;
    }

    const envValue: unknown = finalEnv[varName];
    return isString(envValue) ? envValue : match;
  });
}

function performTokenSubstitution(
  configStr: string,
  finalEnv: Record<string, unknown>,
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
  const configFilePathValue: unknown = config['configFilePath'];
  return isString(configFilePathValue);
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

  const envDefaults: UnknownRecord = { HOME: systemInfo.homeDir, configFileDir };
  const finalEnv = deepMerge(env, envDefaults);
  const configStr = Bun.YAML.stringify(config);
  const substitutedConfigStr = performTokenSubstitution(configStr, finalEnv, fullConfig);

  // Parse the config string back to an object
  const parsedConfigValue: unknown = Bun.YAML.parse(substitutedConfigStr);
  if (!isPlainRecord(parsedConfigValue)) {
    throw new Error('Token substitution produced an invalid configuration.');
  }

  // Expand home paths in the config
  const userConfigPath = hasConfigFilePath(fullConfig) ? fullConfig.configFilePath : undefined;
  const baseDir = userConfigPath ? path.dirname(userConfigPath) : systemInfo.homeDir;

  const expandedConfigValue: unknown = expandHomePathsInObject(parsedConfigValue, baseDir);
  if (!isPlainRecord(expandedConfigValue)) {
    throw new Error('Home path expansion produced an invalid configuration.');
  }

  return expandedConfigValue;
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
  const injectedValues: UnknownRecord = {
    configFilePath: userConfigPath,
    configFileDir: path.dirname(userConfigPath),
  };

  const configWithInjectedValues = deepMerge(configWithPlatformOverrides, injectedValues);
  const configWithTokens = substituteTokens(configWithInjectedValues, env, configWithInjectedValues, systemInfo);
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
  let userConfig: UnknownRecord = EMPTY_RECORD;

  if (!(await fileSystem.exists(userConfigPath))) {
    logger.error(messages.fsItemNotFound('Config file', userConfigPath));
    exitCli(1);
  }

  try {
    const userConfigContent = await fileSystem.readFile(userConfigPath, 'utf-8');
    const parsedUserConfig: unknown = Bun.YAML.parse(userConfigContent);
    userConfig = isPlainRecord(parsedUserConfig) ? parsedUserConfig : EMPTY_RECORD;
  } catch (error) {
    logger.error(
      messages.configurationParseError(userConfigPath, 'YAML', isError(error) ? error.message : String(error))
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
  const userConfigClone: UnknownRecord = deepMerge(EMPTY_RECORD, userConfig);
  return processConfig(parentLogger, resolvedUserConfigPath, defaultConfig, userConfigClone, systemInfo, env);
}
