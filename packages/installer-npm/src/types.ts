import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { IToolInstallationDetails } from '@dotfiles/registry';

/**
 * Metadata specific to npm tool installation.
 */
export interface INpmInstallMetadata extends Partial<IToolInstallationDetails> {
  method: 'npm';
  packageName: string;
}

/**
 * Success result for an npm tool installation.
 */
export interface INpmInstallSuccess extends InstallResultSuccess<INpmInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: INpmInstallMetadata;
}

/**
 * Result type for npm tool installation (success or failure).
 */
export type NpmInstallResult = INpmInstallSuccess | InstallResultFailure;
