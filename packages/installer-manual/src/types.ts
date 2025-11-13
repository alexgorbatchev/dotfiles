import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

/**
 * Metadata specific to manual tool installation.
 */
export interface ManualInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'manual';
  manualInstall: boolean;
}

/**
 * Success result for a manual tool installation.
 */
export interface ManualInstallSuccess extends InstallResultSuccess<ManualInstallMetadata> {
  binaryPaths: string[];
  metadata: ManualInstallMetadata;
}

/**
 * Result type for manual tool installation (success or failure).
 */
export type ManualInstallResult = ManualInstallSuccess | InstallResultFailure;
