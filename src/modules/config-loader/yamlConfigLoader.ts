/**
 * @file YamlConfigLoader.ts
 * @description Implements a layered YAML configuration loader that reads from default-config.yaml
 * and merges with user's config.yaml.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `docs/config-migration-plan.md`
 * - `src/modules/config/config.yaml.schema.ts`
 * - `src/testing-helpers/createMockYamlConfig.ts`
 *
 * ### Tasks:
 * - [x] Import required dependencies.
 * - [x] Implement `createYamlConfigFromFileSystem` to load and process config from files.
 * - [x] Implement `createYamlConfigFromObject` to process config from objects.
 * - [x] Implement helper functions for token substitution, deep merging, and platform-specific overrides.
 * - [x] Write tests for all exported functions.
 * - [x] Fix all errors and warnings by running lint and test.
 * - [x] Remove all commented out code and meta-comments.
 * - [x] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { yamlConfigSchema, type YamlConfig } from '@modules/config';
import { type IFileSystem } from '@modules/file-system';
import { createClientLogger, createLogger } from '@modules/logger';
import { Architecture, hasArchitecture, hasPlatform, Platform, type SystemInfo } from '@types';
import { join } from 'path';
import { parse, stringify } from 'yaml';
import { z } from 'zod/v4';

const log = createLogger('YamlConfigLoader');
const clientLogger = createClientLogger();

/**
 * Detects the current operating system
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
export interface PlatformMatch {
  os?: 'macos' | 'linux' | 'windows';
  arch?: 'x86_64' | 'arm64';
}

/**
 * Platform override from config.yaml
 */
export interface PlatformOverride {
  match: PlatformMatch[];
  config: Record<string, unknown>;
}

/**
 * Deep merges two objects, with values from the second object overriding those in the first.
 * This function creates a new object and does not modify the original objects.
 * @param target - The target object to merge into.
 * @param source - The source object to merge from.
 * @returns The merged object.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
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
      output[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      output[key] = source[key];
    }
  }

  return output as T;
}

/**
 * Deep merges a source object into a target object, modifying the target in place.
 * @param target - The target object to merge into (modified in place).
 * @param source - The source object to merge from.
 */
function deepMergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
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
      deepMergeInto(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      target[key] = source[key];
    }
  }
}

/**
 * Applies platform-specific overrides based on the current OS and architecture.
 * @param config - The configuration object to apply overrides to.
 * @param systemInfo - System information for platform detection.
 * @returns The configuration with platform-specific overrides applied.
 */
function applyPlatformOverrides(
  config: Record<string, unknown>,
  systemInfo: SystemInfo
): Record<string, unknown> {
  const platformOverrides = (config['platform'] as PlatformOverride[]) || [];

  if (!Array.isArray(platformOverrides)) {
    return config;
  }

  const currentPlatform = detectOS(systemInfo.platform);
  const currentArch = detectArch(systemInfo.arch);

  log('applyPlatformOverrides: platform=%s, arch=%s', currentPlatform, currentArch);

  const result = { ...config };

  for (const platformOverride of platformOverrides) {
    if (
      !platformOverride.match ||
      !Array.isArray(platformOverride.match) ||
      !platformOverride.config
    ) {
      continue;
    }

    const matches = platformOverride.match.some((match) => {
      const targetPlatform = match.os
        ? { macos: Platform.MacOS, linux: Platform.Linux, windows: Platform.Windows }[match.os] ||
          Platform.None
        : Platform.None;

      const targetArch = match.arch
        ? { x86_64: Architecture.X86_64, arm64: Architecture.Arm64 }[match.arch] ||
          Architecture.None
        : Architecture.None;

      const currentPlatformEnum =
        {
          macos: Platform.MacOS,
          linux: Platform.Linux,
          windows: Platform.Windows,
        }[currentPlatform] || Platform.None;

      const currentArchEnum =
        { x86_64: Architecture.X86_64, arm64: Architecture.Arm64 }[currentArch] ||
        Architecture.None;

      const osMatches = !match.os || hasPlatform(targetPlatform, currentPlatformEnum);
      const archMatches = !match.arch || hasArchitecture(targetArch, currentArchEnum);
      return osMatches && archMatches;
    });

    if (matches) {
      log('Applying platform override: %o', platformOverride.config);
      deepMergeInto(result, platformOverride.config);
    }
  }

  delete result['platform'];
  return result;
}

/**
 * Expands the tilde (~) character in file paths to the user's home directory.
 * @param path - The file path that may contain a tilde.
 * @param systemInfo - System information containing the home directory.
 * @returns The path with the tilde expanded to the user's home directory.
 */
function expandHomePath(path: string, systemInfo: SystemInfo): string {
  if (typeof path !== 'string') return path;
  if (path.startsWith('~/') || path === '~') {
    return path.replace(/^~(?=$|\/|\\)/, systemInfo.homeDir);
  }
  return path;
}

/**
 * Recursively processes an object to expand home paths in string values.
 * @param obj - The object to process.
 * @param systemInfo - System information containing the home directory.
 * @returns The object with home paths expanded.
 */
function expandHomePathsInObject(obj: unknown, systemInfo: SystemInfo): unknown {
  if (typeof obj === 'string') {
    return expandHomePath(obj, systemInfo);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => expandHomePathsInObject(item, systemInfo));
  }
  
  if (obj && typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandHomePathsInObject(value, systemInfo);
    }
    return result;
  }
  
  return obj;
}

/**
 * Substitutes tokens in the configuration with values from environment variables and other config values.
 * Also expands home paths (~ character) in string values.
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
  systemInfo: SystemInfo
): Record<string, unknown> {
  let configStr = stringify(config);
  let previousConfigStr = '';

  while (previousConfigStr !== configStr) {
    previousConfigStr = configStr;

    configStr = configStr.replace(/\${([^}]+)}/g, (match, varName) => {
      if (varName.includes('.')) {
        const parts = varName.split('.');
        let value: unknown = fullConfig;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
            value = (value as Record<string, unknown>)[part];
          } else {
            return match;
          }
        }
        return typeof value === 'string' ? value : match;
      }

      return env[varName] !== undefined ? env[varName]! : match;
    });
  }

  // Parse the config string back to an object
  const parsedConfig = parse(configStr) as Record<string, unknown>;
  
  // Expand home paths in the config
  return expandHomePathsInObject(parsedConfig, systemInfo) as Record<string, unknown>;
}

function processConfig(
  defaultConfig: Record<string, unknown>,
  userConfig: Record<string, unknown>,
  systemInfo: SystemInfo,
  env: Record<string, string | undefined>
): YamlConfig {
  log('load: systemInfo=%o', systemInfo);

  const mergedConfig = deepMerge(defaultConfig, userConfig);
  const configWithPlatformOverrides = applyPlatformOverrides(mergedConfig, systemInfo);
  const configWithTokens = substituteTokens(
    configWithPlatformOverrides,
    env,
    configWithPlatformOverrides,
    systemInfo
  );

  const result = yamlConfigSchema.safeParse(configWithTokens);

  if (!result.success) {
    const pretty = z.prettifyError(result.error);
    clientLogger.error('YAML config validation error:\n%s', pretty);
    throw new Error(`YAML configuration is invalid.\n${pretty}`);
  }

  return result.data;
}

export const getDefaultConfigPath = (): string => join(__dirname, 'default-config.yaml');

/**
 * Loads the default YAML configuration file from the filesystem and returns it as a raw object.
 *
 * @param fileSystem - The file system interface for reading files.
 * @returns A promise that resolves to the raw YAML object.
 */
export async function loadDefaultYamlConfigAsRecord(
  fileSystem: IFileSystem,
): Promise<Record<string, unknown>> {
  const finalDefaultConfigPath = getDefaultConfigPath();
  let defaultConfig = {};

  try {
    const defaultConfigContent = await fileSystem.readFile(finalDefaultConfigPath, 'utf-8');
    defaultConfig = parse(defaultConfigContent);
  } catch (error) {
    clientLogger.error(
      `Default config file not found or invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    if (process.env.NODE_ENV === 'test') {
      throw error;
    }
  }

  return defaultConfig;
}

/**
 * Creates a validated YAML configuration by loading and merging default and user config files from the filesystem.
 * Applies platform-specific overrides and performs token substitution.
 *
 * @param fileSystem - The file system interface used to read configuration files
 * @param userConfigPath - Path to the user's configuration file
 * @param systemInfo - System information for platform detection
 * @param env - Environment variables for token substitution
 * @returns A promise that resolves to the validated YAML configuration
 * 
 * @testing
 * For unit and integration tests, this function is tested using a mock file system.
 * - `createMemFileSystem`: Used to create an in-memory file system with
 *   `default-config.yaml` and a user `config.yaml` to simulate real-world usage.
 *   (import from `@testing-helpers`)
 */
export async function createYamlConfigFromFileSystem(
  fileSystem: IFileSystem,
  userConfigPath: string,
  systemInfo: SystemInfo,
  env: Record<string, string | undefined>,
): Promise<YamlConfig> {
  const defaultConfig = await loadDefaultYamlConfigAsRecord(fileSystem);
  let userConfig = {};

  try {
    const userConfigContent = await fileSystem.readFile(userConfigPath, 'utf-8');
    userConfig = parse(userConfigContent) || {};
  } catch (error) {
    clientLogger.error(
      `User config file not found or invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return processConfig(defaultConfig, userConfig, systemInfo, env);
}

/**
 * Creates a validated YAML configuration by merging default and user config objects.
 * Applies platform-specific overrides and performs token substitution.
 *
 * @param defaultConfig - The default configuration object
 * @param userConfig - The user configuration object that overrides default values
 * @param systemInfo - System information for platform detection
 * @param env - Environment variables for token substitution
 * @returns A promise that resolves to the validated YAML configuration
 * 
 * @testing
 * This function is primarily tested through `createMockYamlConfig`, which uses
 * it to generate configuration objects from partial mock data.
 * - `createMockYamlConfig`: A helper that simplifies the creation of YAML config files for tests.
 *   (import from `@testing-helpers`)
 */
export async function createYamlConfigFromObject(
  fileSystem: IFileSystem,
  userConfig: Record<string, unknown>,
  systemInfo: SystemInfo,
  env: Record<string, string | undefined>
): Promise<YamlConfig> {
  const defaultConfig = await loadDefaultYamlConfigAsRecord(fileSystem);
  return processConfig(defaultConfig, userConfig, systemInfo, env);
}
