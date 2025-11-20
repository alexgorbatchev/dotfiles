import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { IToolInstallationDetails } from '@dotfiles/registry';

/**
 * Metadata specific to manual tool installation.
 */
export interface IManualInstallMetadata extends Partial<IToolInstallationDetails> {
  method: 'manual';
  manualInstall: boolean;
}

/**
 * Success result for a manual tool installation.
 */
export interface IManualInstallSuccess extends InstallResultSuccess<IManualInstallMetadata> {
  binaryPaths: string[];
  metadata: IManualInstallMetadata;
}

/**
 * Result type for manual tool installation (success or failure).
 */
export type ManualInstallResult = IManualInstallSuccess | InstallResultFailure;
