import type { InstallResultFailure, InstallResultSuccess } from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

/**
 * Metadata specific to zsh plugin installation.
 */
export interface IZshPluginInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "zsh-plugin";
  pluginName: string;
  gitUrl: string;
  pluginPath: string;
  /**
   * The detected or specified source file for the plugin.
   * This is the file that will be sourced to load the plugin.
   */
  sourceFile: string;
}

/**
 * Success result for a zsh plugin installation.
 */
export interface IZshPluginInstallSuccess extends InstallResultSuccess<IZshPluginInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: IZshPluginInstallMetadata;
}

/**
 * Result type for zsh plugin installation (success or failure).
 */
export type ZshPluginInstallResult = IZshPluginInstallSuccess | InstallResultFailure;
