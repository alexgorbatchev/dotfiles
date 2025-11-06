import type { OperationFailure, OperationSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

export interface ManualInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'manual';
  manualInstall: boolean;
}

export interface ManualInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: ManualInstallMetadata;
}

export type ManualInstallResult = ManualInstallSuccess | OperationFailure;
