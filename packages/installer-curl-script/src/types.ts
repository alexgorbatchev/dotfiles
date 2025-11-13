import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

export interface CurlScriptInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'curl-script';
  scriptUrl: string;
  shell: string;
}

export interface CurlScriptInstallSuccess extends InstallResultSuccess<CurlScriptInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: CurlScriptInstallMetadata;
}

export type CurlScriptInstallResult = CurlScriptInstallSuccess | InstallResultFailure;
