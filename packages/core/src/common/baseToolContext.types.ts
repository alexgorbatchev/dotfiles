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
}
