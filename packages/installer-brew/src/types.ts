import type { OperationFailure, OperationSuccess } from '@dotfiles/core';

export interface BrewInstallMetadata {
  method: 'brew';
  formula: string;
  isCask: boolean;
  tap?: string | string[];
}

export interface BrewInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version?: string;
  metadata: BrewInstallMetadata;
}

export type BrewInstallResult = BrewInstallSuccess | OperationFailure;
