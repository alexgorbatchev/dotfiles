import type { OperationFailure, OperationSuccess } from '@dotfiles/core';

export interface CargoInstallMetadata {
  method: 'cargo';
  crateName: string;
  binarySource: string;
  downloadUrl?: string;
}

export interface CargoInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version: string;
  originalTag?: string;
  metadata: CargoInstallMetadata;
}

export type CargoInstallResult = CargoInstallSuccess | OperationFailure;
