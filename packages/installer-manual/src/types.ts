import type { OperationFailure, OperationSuccess } from '@dotfiles/installer';

export interface ManualInstallMetadata {
  method: 'manual';
  manualInstall: boolean;
}

export interface ManualInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: ManualInstallMetadata;
}

export type ManualInstallResult = ManualInstallSuccess | OperationFailure;
