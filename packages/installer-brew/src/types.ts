import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

/**
 * Metadata specific to Homebrew tool installation.
 */
export interface BrewInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'brew';
  formula: string;
  isCask: boolean;
  tap?: string | string[];
}

/**
 * Success result for a Homebrew tool installation.
 */
export interface BrewInstallSuccess extends InstallResultSuccess<BrewInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: BrewInstallMetadata;
}

/**
 * Result type for Homebrew tool installation (success or failure).
 */
export type BrewInstallResult = BrewInstallSuccess | InstallResultFailure;
