import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

export interface ManualInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'manual';
  manualInstall: boolean;
}

export interface ManualInstallSuccess extends InstallResultSuccess<ManualInstallMetadata> {
  binaryPaths: string[];
  metadata: ManualInstallMetadata;
}

export type ManualInstallResult = ManualInstallSuccess | InstallResultFailure;
