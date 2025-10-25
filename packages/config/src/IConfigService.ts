import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { ToolConfig } from '@dotfiles/schemas';
import type { YamlConfig } from '@dotfiles/schemas/config';

/**
 * Interface for configuration loading services.
 * This allows dependency injection instead of direct module imports.
 */
export interface IConfigService {
  /**
   * Load configuration for a single tool.
   */
  loadSingleToolConfig(
    logger: TsLogger,
    toolName: string,
    toolConfigsDir: string,
    fs: IFileSystem,
    yamlConfig: YamlConfig
  ): Promise<ToolConfig | undefined>;

  /**
   * Load all tool configurations from a directory.
   */
  loadToolConfigs(
    logger: TsLogger,
    toolConfigsDir: string,
    fs: IFileSystem,
    yamlConfig: YamlConfig
  ): Promise<Record<string, ToolConfig>>;
}
