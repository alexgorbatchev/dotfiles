/**
 * @file YamlConfigLoader.ts
 * @description Implements a layered YAML configuration loader that reads from default-config.yaml
 * and merges with user's config.yaml.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `docs/config-migration-plan.md`
 * - `src/types/config.yaml.types.ts`
 * - `src/modules/config/config.yaml.schema.ts`
 *
 * ### Tasks:
 * - [x] Import required dependencies
 * - [x] Define IYamlConfigLoader interface
 * - [x] Implement YamlConfigLoader class
 *   - [x] Implement constructor with IFileSystem dependency
 *   - [x] Implement load() method to read and merge YAML files
 *   - [x] Implement token substitution for environment variables and config references
 *   - [x] Implement deep merge functionality for configs
 *   - [x] Implement platform-specific overrides based on OS and architecture
 * - [x] Write tests for YamlConfigLoader
 * - [x] Fix all errors and warnings by running lint and test
 * - [x] Remove all commented out code and meta-comments
 * - [x] Ensure 100% test coverage for executable code
 * - [x] Update the memory bank with the new information when all tasks are complete
 */

import { yamlConfigSchema, type SystemInfo, type YamlConfig } from '@modules/config';
import { type IFileSystem } from '@modules/file-system';
import { createLogger } from '@modules/logger';
import { Architecture, hasArchitecture, hasPlatform, Platform, } from '@types';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const log = createLogger('YamlConfigLoader');

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
 * Interface for the YAML configuration loader
 */
export interface IYamlConfigLoader {
  /**
   * Loads and merges configuration from default-config.yaml and user's config.yaml
   * @param userConfigPath - Path to the user's config.yaml file
   * @param systemInfo - System information for platform detection and path resolution
   * @param env - Environment variables for token substitution
   * @returns The merged and validated configuration object
   */
  load(userConfigPath: string, systemInfo: SystemInfo, env: Record<string, string | undefined>): Promise<YamlConfig>;
}

/**
 * Loads and merges configuration from default-config.yaml and user's config.yaml
 */
export class YamlConfigLoader implements IYamlConfigLoader {
  private readonly fileSystem: IFileSystem;
  private readonly defaultConfigPath: string;

  /**
   * Creates a new YamlConfigLoader
   * @param fileSystem - The file system implementation to use
   * @param defaultConfigPath - Path to the default-config.yaml file (optional)
   */
  constructor(fileSystem: IFileSystem, defaultConfigPath?: string) {
    log('constructor: fileSystem=%o, defaultConfigPath=%s', fileSystem, defaultConfigPath);
    this.fileSystem = fileSystem;
    this.defaultConfigPath = defaultConfigPath || join(process.cwd(), 'src', 'config', 'default-config.yaml');
  }

  /**
   * Loads and merges configuration from default-config.yaml and user's config.yaml
   * @param userConfigPath - Path to the user's config.yaml file
   * @param systemInfo - System information for platform detection and path resolution
   * @param env - Environment variables for token substitution
   * @returns The merged and validated configuration object
   */
  async load(
    userConfigPath: string,
    systemInfo: SystemInfo,
    env: Record<string, string | undefined>
  ): Promise<YamlConfig> {
    log('load: userConfigPath=%s, systemInfo=%o', userConfigPath, systemInfo);

    // 1. Read and parse the default-config.yaml
    const defaultConfigContent = await this.fileSystem.readFile(this.defaultConfigPath, 'utf-8');
    const defaultConfig = parse(defaultConfigContent);

    // 2. Read and parse the user's config.yaml if it exists
    let userConfig = {};
    try {
      const userConfigContent = await this.fileSystem.readFile(userConfigPath, 'utf-8');
      userConfig = parse(userConfigContent) || {};
    } catch (error) {
      // If the user's config file doesn't exist, use an empty object
      log('User config file not found or invalid: %s', error);
    }

    // 3. Apply platform-specific overrides to default config
    const defaultConfigWithPlatformOverrides = this.applyPlatformOverrides(defaultConfig);

    // 4. Deep merge the user's config on top of the default config with platform overrides
    const mergedConfig = this.deepMerge(defaultConfigWithPlatformOverrides, userConfig);

    // 5. Perform token substitution
    const configWithTokens = this.substituteTokens(mergedConfig, env, mergedConfig);

    // 6. Validate the final config against the schema
    const validatedConfig = yamlConfigSchema.parse(configWithTokens);

    return validatedConfig;
  }

  /**
   * Deep merges two objects, with values from the second object overriding those in the first
   * @param target - The target object to merge into
   * @param source - The source object to merge from
   * @returns The merged object
   */
  private deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
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
        // If both values are objects, recursively merge them
        output[key] = this.deepMerge(
          target[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        );
      } else {
        // Otherwise, override the target value with the source value
        output[key] = source[key];
      }
    }

    return output as T;
  }

  /**
   * Applies platform-specific overrides based on the current OS and architecture
   * @param config - The configuration object to apply overrides to
   * @param systemInfo - System information for platform detection
   * @returns The configuration with platform-specific overrides applied
   */
  private applyPlatformOverrides(
    config: Record<string, unknown>
  ): Record<string, unknown> {
    const platformOverrides = config['platform'] as PlatformOverride[] | undefined;
    
    if (!platformOverrides || !Array.isArray(platformOverrides)) {
      return config;
    }

    // Determine the current OS and architecture
    const currentPlatform = this.detectOS();
    const currentArch = this.detectArch();

    log('applyPlatformOverrides: platform=%s, arch=%s', currentPlatform, currentArch);

    // Create a copy of the config to apply overrides to
    const result = { ...config };

    // Apply each platform override that matches the current OS and architecture
    for (const platformOverride of platformOverrides) {
      if (!platformOverride.match || !Array.isArray(platformOverride.match) || !platformOverride.config) {
        continue;
      }

      // Check if any of the match conditions apply to the current platform
      const matches = platformOverride.match.some((match) => {
        // Convert string OS to Platform enum
        let targetPlatform = Platform.None;
        if (match.os === 'macos') targetPlatform = Platform.MacOS;
        else if (match.os === 'linux') targetPlatform = Platform.Linux;
        else if (match.os === 'windows') targetPlatform = Platform.Windows;
        
        // Convert string architecture to Architecture enum
        let targetArch = Architecture.None;
        if (match.arch === 'x86_64') targetArch = Architecture.X86_64;
        else if (match.arch === 'arm64') targetArch = Architecture.Arm64;
        
        // Convert currentPlatform and currentArch strings to enum values
        let currentPlatformEnum = Platform.None;
        if (currentPlatform === 'macos') currentPlatformEnum = Platform.MacOS;
        else if (currentPlatform === 'linux') currentPlatformEnum = Platform.Linux;
        else if (currentPlatform === 'windows') currentPlatformEnum = Platform.Windows;
        
        let currentArchEnum = Architecture.None;
        if (currentArch === 'x86_64') currentArchEnum = Architecture.X86_64;
        else if (currentArch === 'arm64') currentArchEnum = Architecture.Arm64;
        
        const osMatches = !match.os || hasPlatform(targetPlatform, currentPlatformEnum);
        const archMatches = !match.arch || hasArchitecture(targetArch, currentArchEnum);
        return osMatches && archMatches;
      });

      if (matches) {
        log('Applying platform override: %o', platformOverride.config);
        // Deep merge the platform override into the result
        this.deepMergeInto(result, platformOverride.config);
      }
    }

    // Remove the platform key from the result as it's not part of the final config
    delete result['platform'];

    return result;
  }

  /**
   * Deep merges a source object into a target object, modifying the target
   * @param target - The target object to merge into (modified in place)
   * @param source - The source object to merge from
   */
  private deepMergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
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
        // If both values are objects, recursively merge them
        this.deepMergeInto(
          target[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        );
      } else {
        // Otherwise, override the target value with the source value
        target[key] = source[key];
      }
    }
  }

  /**
   * Detects the current operating system
   * @returns The detected OS as a string ('macos', 'linux', or 'windows')
   */
  private detectOS(): string {
    const platform = process.platform;
    if (platform === 'darwin') return 'macos';
    if (platform === 'linux') return 'linux';
    if (platform === 'win32') return 'windows';
    return platform;
  }

  /**
   * Detects the current architecture
   * @returns The detected architecture as a string ('x86_64' or 'arm64')
   */
  private detectArch(): string {
    const arch = process.arch;
    if (arch === 'x64') return 'x86_64';
    if (arch === 'arm64') return 'arm64';
    return arch;
  }

  /**
   * Substitutes tokens in the configuration with values from environment variables and other config values
   * @param config - The configuration object to substitute tokens in
   * @param env - Environment variables for substitution
   * @param fullConfig - The full configuration object for reference substitution
   * @returns The configuration with tokens substituted
   */
  private substituteTokens(
    config: Record<string, unknown>,
    env: Record<string, string | undefined>,
    fullConfig: Record<string, unknown>
  ): Record<string, unknown> {
    // Convert the config to a string to easily find and replace tokens
    let configStr = stringify(config);
    let previousConfigStr = '';
    
    // Keep substituting tokens until no more substitutions can be made
    while (previousConfigStr !== configStr) {
      previousConfigStr = configStr;
      
      // Replace environment variable tokens (${VAR_NAME})
      configStr = configStr.replace(/\${([^}]+)}/g, (match, varName) => {
        // Check if this is a reference to another config value (e.g., ${paths.dotfilesDir})
        if (varName.includes('.')) {
          const parts = varName.split('.');
          let value: unknown = fullConfig;
          for (const part of parts) {
            if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
              value = (value as Record<string, unknown>)[part];
            } else {
              // If the reference doesn't exist, return the original token
              return match;
            }
          }
          return typeof value === 'string' ? value : match;
        }

        // Otherwise, treat it as an environment variable
        return env[varName] !== undefined ? env[varName]! : match;
      });
    }

    // Parse the string back to an object
    return parse(configStr) as Record<string, unknown>;
  }
}