import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { IToolInstallationDetails } from '@dotfiles/registry';

export * from './types/ICurlScriptArgsContext';

import type { ICurlScriptArgsContext } from './types/ICurlScriptArgsContext';

export type CurlScriptArgsFunction = (ctx: ICurlScriptArgsContext) => string[] | Promise<string[]>;
export type CurlScriptArgs = string[] | CurlScriptArgsFunction;

/**
 * Metadata specific to curl-script tool installation.
 */
export interface ICurlScriptInstallMetadata extends Partial<IToolInstallationDetails> {
  method: 'curl-script';
  scriptUrl: string;
  shell: string;
}

/**
 * Success result for a curl-script tool installation.
 */
export interface ICurlScriptInstallSuccess extends InstallResultSuccess<ICurlScriptInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: ICurlScriptInstallMetadata;
}

/**
 * Result type for curl-script tool installation (success or failure).
 */
export type CurlScriptInstallResult = ICurlScriptInstallSuccess | InstallResultFailure;
