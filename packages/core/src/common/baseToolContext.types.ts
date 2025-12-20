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
   * Absolute path to the directory containing the tool's `.tool.ts` file.
   *
   * This is the **tool configuration directory**. It is the reference point for all
   * relative paths in `.tool.ts` files (for example `./config.toml`, `./themes/`, etc.).
   *
   * This value is derived from the path to the `.tool.ts` file itself.
   *
   * @example
   * If your tool config is located at:
   * `"${projectConfig.paths.toolConfigsDir}/fzf/fzf.tool.ts"`
   * then:
   * `toolDir === "${projectConfig.paths.toolConfigsDir}/fzf"`
   *
   * @example
   * Use `toolDir` to reference a file next to the tool config:
   * `"${toolDir}/shell/key-bindings.zsh"`
   */
  toolDir: string;
}
