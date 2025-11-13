import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

/**
 * Metadata specific to curl-tar tool installation.
 */
export interface CurlTarInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'curl-tar';
  tarballUrl: string;
}

/**
 * Success result for a curl-tar tool installation.
 */
export interface CurlTarInstallSuccess extends InstallResultSuccess<CurlTarInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: CurlTarInstallMetadata;
}

/**
 * Result type for curl-tar tool installation (success or failure).
 */
export type CurlTarInstallResult = CurlTarInstallSuccess | InstallResultFailure;
