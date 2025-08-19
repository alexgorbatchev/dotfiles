import type { YamlConfig } from '@modules/config';
import type { TsLogger } from '@modules/logger';

/**
 * Base context providing common functionality across tool configuration and installation phases.
 * Contains shared properties like tool identity, path utilities, configuration access, and logging.
 */
export interface BaseToolContext {
  /**
   * The name of the tool
   */
  toolName: string;

  /**
   * Current tool's installation directory
   */
  toolDir: string;

  /**
   * Get the installation directory for any tool
   * @param toolName - Name of the tool
   * @returns Full path to the specified tool's installation directory
   */
  getToolDir(toolName: string): string;

  /**
   * User's home directory path (from yamlConfig.paths.homeDir)
   */
  homeDir: string;

  /**
   * Generated binaries directory (from yamlConfig.paths.binariesDir)
   */
  binDir: string;

  /**
   * Generated shell scripts directory (from yamlConfig.paths.shellScriptsDir)
   */
  shellScriptsDir: string;

  /**
   * Root dotfiles directory (from yamlConfig.paths.dotfilesDir)
   */
  dotfilesDir: string;

  /**
   * Generated files directory (from yamlConfig.paths.generatedDir)
   */
  generatedDir: string;

  /**
   * The user's application configuration (YAML config)
   */
  appConfig: YamlConfig;

  /**
   * Logger instance for structured logging
   */
  logger: TsLogger;
}
