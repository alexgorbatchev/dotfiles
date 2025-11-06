import type { OperationFailure, OperationSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

export interface CurlScriptInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'curl-script';
  scriptUrl: string;
  shell: string;
}

export interface CurlScriptInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: CurlScriptInstallMetadata;
}

export type CurlScriptInstallResult = CurlScriptInstallSuccess | OperationFailure;
