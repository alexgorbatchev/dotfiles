import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

/**
 * Metadata specific to curl-script tool installation.
 */
export interface CurlScriptInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'curl-script';
  scriptUrl: string;
  shell: string;
}

/**
 * Success result for a curl-script tool installation.
 */
export interface CurlScriptInstallSuccess extends InstallResultSuccess<CurlScriptInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: CurlScriptInstallMetadata;
}

/**
 * Result type for curl-script tool installation (success or failure).
 */
export type CurlScriptInstallResult = CurlScriptInstallSuccess | InstallResultFailure;
