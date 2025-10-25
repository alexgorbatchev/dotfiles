import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { ToolConfig } from '@dotfiles/schemas';
import type { YamlConfig } from '@dotfiles/schemas/config';
import type { IConfigService } from './IConfigService';
import {
  loadSingleToolConfig as actualLoadSingleToolConfig,
  loadToolConfigs as actualLoadToolConfigs,
} from './loadToolConfigs';

/**
 * Default implementation of IConfigService that uses the actual config loading functions.
 */
export class ConfigService implements IConfigService {
  async loadSingleToolConfig(
    logger: TsLogger,
    toolName: string,
    toolConfigsDir: string,
    fs: IFileSystem,
    yamlConfig: YamlConfig
  ): Promise<ToolConfig | undefined> {
    return actualLoadSingleToolConfig(logger, toolName, toolConfigsDir, fs, yamlConfig);
  }

  async loadToolConfigs(
    logger: TsLogger,
    toolConfigsDir: string,
    fs: IFileSystem,
    yamlConfig: YamlConfig
  ): Promise<Record<string, ToolConfig>> {
    return actualLoadToolConfigs(logger, toolConfigsDir, fs, yamlConfig);
  }
}
