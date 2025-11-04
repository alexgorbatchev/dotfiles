import type { OperationFailure, OperationSuccess } from '@dotfiles/installer';

export interface CurlScriptInstallMetadata {
  method: 'curl-script';
  scriptUrl: string;
  shell: string;
}

export interface CurlScriptInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: CurlScriptInstallMetadata;
}

export type CurlScriptInstallResult = CurlScriptInstallSuccess | OperationFailure;
