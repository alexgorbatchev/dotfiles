import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { IToolInstallationDetails } from '@dotfiles/registry';

/**
 * Metadata specific to Homebrew tool installation.
 */
export interface IBrewInstallMetadata extends Partial<IToolInstallationDetails> {
  method: 'brew';
  formula: string;
  isCask: boolean;
  tap?: string | string[];
}

/**
 * Success result for a Homebrew tool installation.
 */
export interface IBrewInstallSuccess extends InstallResultSuccess<IBrewInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: IBrewInstallMetadata;
}

/**
 * Result type for Homebrew tool installation (success or failure).
 */
export type BrewInstallResult = IBrewInstallSuccess | InstallResultFailure;
