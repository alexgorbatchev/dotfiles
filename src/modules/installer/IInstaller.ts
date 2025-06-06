/**
 * @file generator/src/modules/installer/IInstaller.ts
 * @description Interface for the tool installer module.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `generator/src/types.ts` (for ToolConfig, InstallParams types)
 * - `.clinerules` (for file structure, naming, and content guidelines)
 *
 * ### Tasks:
 * - [x] Define `InstallOptions` interface.
 * - [x] Define `InstallResult` interface.
 * - [x] Define `IInstaller` interface with `install` method.
 * - [ ] Write tests for the module.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { ToolConfig } from '../../types';

/**
 * Options for the install operation
 */
export interface InstallOptions {
  /**
   * Whether to force installation even if the tool is already installed
   */
  force?: boolean;

  /**
   * Whether to show verbose output during installation
   */
  verbose?: boolean;
}

/**
 * Result of the install operation
 */
export interface InstallResult {
  /**
   * Whether the installation was successful
   */
  success: boolean;

  /**
   * The path to the installed binary
   */
  binaryPath?: string;

  /**
   * The version of the installed tool
   */
  version?: string;

  /**
   * Error message if installation failed
   */
  error?: string;

  /**
   * Additional information about the installation
   */
  info?: Record<string, any>;
}

/**
 * Interface for the tool installer
 */
export interface IInstaller {
  /**
   * Install a tool based on its configuration
   *
   * @param toolName The name of the tool to install
   * @param toolConfig The tool configuration
   * @param options Installation options
   * @returns Promise resolving to the installation result
   */
  install(
    toolName: string,
    toolConfig: ToolConfig,
    options?: InstallOptions
  ): Promise<InstallResult>;
}
