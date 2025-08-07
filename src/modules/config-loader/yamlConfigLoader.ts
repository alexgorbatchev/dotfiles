import { yamlConfigSchema, type YamlConfig, type YamlConfigPartial } from '@modules/config';
import { type IFileSystem } from '@modules/file-system';
import { type TsLogger } from '@modules/logger';
import { Architecture, hasArchitecture, hasPlatform, Platform, type SystemInfo } from '@types';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { expandHomePath } from '@utils';
import { exitCli } from '../cli';
import { ErrorTemplates, SuccessTemplates } from '@modules/shared/ErrorTemplates';
import path from 'node:path';


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
 * 
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
 * Applies platform-specific overrides based on the current OS and architecture.
 * 
 * @param config - The configuration object to apply overrides to.
 * @param systemInfo - System information for platform detection.
 * @returns The configuration with platform-specific overrides applied.
 */
function applyPlatformOverrides(
  parentLogger: TsLogger,
  config: Record<string, unknown>,
  systemInfo: SystemInfo
): Record<string, unknown> {
  const logger = parentLogger.getSubLogger({ name: 'applyPlatformOverrides' });
  const platformOverrides = (config['platform'] as PlatformOverride[]) || [];

  if (!Array.isArray(platformOverrides)) {
    return config;
  }

  const currentPlatform = detectOS(systemInfo.platform);
  const currentArch = detectArch(systemInfo.arch);

  logger.debug(SuccessTemplates.config.platformOverrides(currentPlatform, currentArch));

  let result: Record<string, unknown> = deepMerge({}, config );

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
      logger.trace(SuccessTemplates.config.validated('platform override'), platformOverride.config);
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
  systemInfo: SystemInfo
): Record<string, unknown> {
  const finalEnv = deepMerge( env, { HOME: systemInfo.homeDir } );
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

      return finalEnv[varName] !== undefined ? finalEnv[varName] : match;
    });
  }

  // Parse the config string back to an object
  const parsedConfig = parse(configStr) as Record<string, unknown>;

  // Expand home paths in the config
  // Use config file directory as base for relative paths, fall back to system homeDir if no config path
  const userConfigPath = (fullConfig as any).userConfigPath as string | undefined;
  const baseDir = userConfigPath ? path.dirname(userConfigPath) : systemInfo.homeDir;
  return expandHomePathsInObject(parsedConfig, baseDir) as Record<string, unknown>;
}

function processConfig(
  parentLogger: TsLogger,
  defaultConfig: Record<string, unknown>,
  userConfig: Record<string, unknown>,
  systemInfo: SystemInfo,
  env: Record<string, string | undefined>
): YamlConfig {
  const logger = parentLogger.getSubLogger({ name: 'processConfig' });
  logger.debug(SuccessTemplates.config.configProcessing(), defaultConfig, userConfig, systemInfo);

  const mergedConfig = deepMerge(defaultConfig, userConfig);
  const configWithPlatformOverrides = applyPlatformOverrides(parentLogger, mergedConfig, systemInfo);
  const configWithTokens = substituteTokens(
    configWithPlatformOverrides,
    env,
    configWithPlatformOverrides,
    systemInfo
  );

  const result = yamlConfigSchema.safeParse(configWithTokens);

  if (!result.success) {
    const pretty = z.prettifyError(result.error);
    logger.error(ErrorTemplates.config.validationFailed([pretty]));
    throw new Error(`YAML configuration is invalid.\n${pretty}`);
  }

  return result.data;
}

export async function getDefaultConfig(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  systemInfo: SystemInfo,
  env: Record<string, string | undefined>
): Promise<YamlConfig> {
  const defaultConfig = await loadDefaultYamlConfigAsRecord(fileSystem);
  return processConfig(parentLogger, defaultConfig, {}, systemInfo, env);
}

/**
 * Loads the default YAML configuration file from the filesystem and returns it as a raw object.
 *
 * @param fileSystem - The file system interface for reading files.
 * @returns A promise that resolves to the raw YAML object.
 */
export async function loadDefaultYamlConfigAsRecord(
  _fileSystem: IFileSystem
): Promise<Record<string, unknown>> {
  return yamlConfigSchema.parse({});
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
export async function loadYamlConfig(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  userConfigPath: string,
  systemInfo: SystemInfo,
  env: Record<string, string | undefined>
): Promise<YamlConfig> {
  const logger = parentLogger.getSubLogger({ name: 'loadYamlConfig' });
  const defaultConfig = await loadDefaultYamlConfigAsRecord(fileSystem);
  let userConfig = {};

  if (!await fileSystem.exists(userConfigPath)) {
    logger.error(ErrorTemplates.fs.notFound('Config file', userConfigPath));
    exitCli(1);
  }

  try {
    const userConfigContent = await fileSystem.readFile(userConfigPath, 'utf-8');
    userConfig = parse(userConfigContent) || {};
    (userConfig as YamlConfig).userConfigPath = userConfigPath;
  } catch (error) {
    logger.error(ErrorTemplates.config.parseErrors(userConfigPath, 'YAML', error instanceof Error ? error.message : String(error)));
  }

  return processConfig(parentLogger, defaultConfig, userConfig, systemInfo, env);
}

/**
 * Creates a validated YAML configuration by merging default and user config objects.  Applies platform-specific
 * overrides and performs token substitution.
 *
 * @param defaultConfig - The default configuration object
 * @param userConfig - The user configuration object that overrides default values
 * @param systemInfo - System information for platform detection
 * @param env - Environment variables for token substitution
 * @returns A promise that resolves to the validated YAML configuration
 *
 * @testing
 * When writing tests, `createMockYamlConfig` should be used to create a mock configuration object.
 */
export async function createYamlConfigFromObject(
  parentLogger: TsLogger,
  fileSystem: IFileSystem,
  userConfig: YamlConfigPartial = {},
  systemInfo: SystemInfo = { platform: 'darwin', arch: 'x64', homeDir: '/Users/testuser' },
  env: Record<string, string | undefined> = {}
): Promise<YamlConfig> {
  const defaultConfig = await loadDefaultYamlConfigAsRecord(fileSystem);
  const userConfigClone = deepMerge({} as YamlConfigPartial, userConfig);

  if (userConfigClone.userConfigPath === undefined) {
    userConfigClone.userConfigPath = '/path/to/config.yaml';
  }

  return processConfig(parentLogger, defaultConfig, userConfigClone, systemInfo, env);
}
