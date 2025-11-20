import type { ProjectConfig } from '../config';
import type { ISystemInfo } from './common.types';

/**
 * Provides a base context with common properties and utilities that are shared
 * across various phases of tool configuration and installation.
 *
 * This interface includes essential information such as the tool's identity,
 * important directory paths, and application configuration.
 *
 * @see {@link IToolConfigContext}
 * @see {@link InstallerContext}
 */
export interface IBaseToolContext {
  /**
   * The user's parsed application configuration from the main `config.yaml` file.
   */
  projectConfig: ProjectConfig;

  /**
   * Information about the system on which the installation is occurring
   * (e.g., platform, architecture).
   */
  systemInfo: ISystemInfo;

  /**
   * The name of the tool currently being processed.
   */
  toolName: string;

  /**
   * The absolute path to the installation directory for the current tool.
   * This is equivalent to calling `getToolDir(toolName)`.
   */
  toolDir: string;

  /**
   * Returns the installation directory for a specified tool.
   * @param toolName - The name of the tool.
   * @returns The absolute path to the tool's installation directory.
   */
  getToolDir(toolName: string): string;

  /**
   * The absolute path to the user's home directory, as defined in the
   * application configuration (`projectConfig.paths.homeDir`).
   */
  homeDir: string;

  /**
   * The absolute path to the directory where generated binaries (shims) are
   * stored, as defined in `projectConfig.paths.binariesDir`.
   */
  binDir: string;

  /**
   * The absolute path to the directory where generated shell scripts are
   * stored, as defined in `projectConfig.paths.shellScriptsDir`.
   */
  shellScriptsDir: string;

  /**
   * The absolute path to the root directory containing the user's dotfiles,
   * as defined in `projectConfig.paths.dotfilesDir`.
   */
  dotfilesDir: string;

  /**
   * The absolute path to the directory where all generated files are stored,
   * as defined in `projectConfig.paths.generatedDir`.
   */
  generatedDir: string;
}
