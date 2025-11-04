import type { OperationFailure, OperationSuccess } from '@dotfiles/installer';

export interface CurlTarInstallMetadata {
  method: 'curl-tar';
  downloadUrl: string;
  tarballUrl: string;
}

export interface CurlTarInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version?: string;
  metadata: CurlTarInstallMetadata;
}

export type CurlTarInstallResult = CurlTarInstallSuccess | OperationFailure;
