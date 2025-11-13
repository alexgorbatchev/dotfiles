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
   * @inheritdoc IConfigService.loadSingleToolConfig
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
   * @inheritdoc IConfigService.loadToolConfigs
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
