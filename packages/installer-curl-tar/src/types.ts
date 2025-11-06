import type { OperationFailure, OperationSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

export interface CurlTarInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'curl-tar';
  tarballUrl: string;
}

export interface CurlTarInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version?: string;
  metadata: CurlTarInstallMetadata;
}

export type CurlTarInstallResult = CurlTarInstallSuccess | OperationFailure;
