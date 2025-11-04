import type { ToolConfig, YamlConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { IConfigService } from './IConfigService';
import {
  loadSingleToolConfig as actualLoadSingleToolConfig,
  loadToolConfigs as actualLoadToolConfigs,
} from './loadToolConfigs';

/**
 * Default implementation of {@link IConfigService} that delegates to the actual config loading functions.
 *
 * This service acts as a simple wrapper around the core configuration loading logic,
 * providing a clean interface for dependency injection in consuming code.
 */
export class ConfigService implements IConfigService {
  /**
   * Loads configuration for a single tool by delegating to the core loading function.
   *
   * @param logger - Logger instance for logging operations.
   * @param toolName - The name of the tool to load configuration for.
   * @param toolConfigsDir - Directory containing tool configuration files.
   * @param fs - File system interface for reading configuration files.
   * @param yamlConfig - Parsed YAML configuration object.
   * @returns The tool configuration if found, undefined otherwise.
   */
  async loadSingleToolConfig(
    logger: TsLogger,
    toolName: string,
    toolConfigsDir: string,
    fs: IFileSystem,
    yamlConfig: YamlConfig
  ): Promise<ToolConfig | undefined> {
    return actualLoadSingleToolConfig(logger, toolName, toolConfigsDir, fs, yamlConfig);
  }

  /**
   * Loads all tool configurations from a directory by delegating to the core loading function.
   *
   * @param logger - Logger instance for logging operations.
   * @param toolConfigsDir - Directory containing tool configuration files.
   * @param fs - File system interface for reading configuration files.
   * @param yamlConfig - Parsed YAML configuration object.
   * @returns A record mapping tool names to their configurations.
   */
  async loadToolConfigs(
    logger: TsLogger,
    toolConfigsDir: string,
    fs: IFileSystem,
    yamlConfig: YamlConfig
  ): Promise<Record<string, ToolConfig>> {
    return actualLoadToolConfigs(logger, toolConfigsDir, fs, yamlConfig);
  }
}
