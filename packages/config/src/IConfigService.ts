import type { ISystemInfo, ProjectConfig, ToolConfig } from "@dotfiles/core";
import type { IResolvedFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";

/**
 * Interface for configuration loading services.
 *
 * This service provides methods to load tool configurations from the filesystem,
 * allowing dependency injection instead of direct module imports for better testability.
 */
export interface IConfigService {
  /**
   * Loads configuration for a single tool.
   *
   * @param logger - Logger instance for logging operations.
   * @param toolName - The name of the tool to load configuration for.
   * @param toolConfigsDir - Directory containing tool configuration files.
   * @param fs - File system interface for reading configuration files.
   * @param projectConfig - Parsed project configuration object.
   * @param systemInfo - System information for context creation.
   * @returns The tool configuration if found, undefined otherwise.
   */
  loadSingleToolConfig(
    logger: TsLogger,
    toolName: string,
    toolConfigsDir: string,
    fs: IResolvedFileSystem,
    projectConfig: ProjectConfig,
    systemInfo: ISystemInfo,
  ): Promise<ToolConfig | undefined>;

  /**
   * Loads a tool configuration by searching for a tool that provides the specified binary.
   *
   * This method scans all tool configurations in the directory and finds the tool that
   * defines the given binary name via `.bin()`. If multiple tools define the same binary,
   * returns an error result. If no tool defines the binary, returns undefined.
   *
   * @param logger - Logger instance for logging operations.
   * @param binaryName - The name of the binary to search for.
   * @param toolConfigsDir - Directory containing tool configuration files.
   * @param fs - File system interface for reading configuration files.
   * @param projectConfig - Parsed project configuration object.
   * @param systemInfo - System information for context creation.
   * @returns The tool configuration if found, undefined if not found, or an error message if multiple tools define the binary.
   */
  loadToolConfigByBinary(
    logger: TsLogger,
    binaryName: string,
    toolConfigsDir: string,
    fs: IResolvedFileSystem,
    projectConfig: ProjectConfig,
    systemInfo: ISystemInfo,
  ): Promise<ToolConfig | undefined | { error: string }>;

  /**
   * Loads all tool configurations from a directory.
   *
   * @param logger - Logger instance for logging operations.
   * @param toolConfigsDir - Directory containing tool configuration files.
   * @param fs - File system interface for reading configuration files.
   * @param projectConfig - Parsed project configuration object.
   * @param systemInfo - System information for context creation.
   * @returns A record mapping tool names to their configurations.
   */
  loadToolConfigs(
    logger: TsLogger,
    toolConfigsDir: string,
    fs: IResolvedFileSystem,
    projectConfig: ProjectConfig,
    systemInfo: ISystemInfo,
  ): Promise<Record<string, ToolConfig>>;
}
