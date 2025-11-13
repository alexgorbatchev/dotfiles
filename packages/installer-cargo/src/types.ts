import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

export interface CargoInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'cargo';
  crateName: string;
  binarySource: string;
}

export interface CargoInstallSuccess extends InstallResultSuccess<CargoInstallMetadata> {
  binaryPaths: string[];
  version: string;
  originalTag?: string;
  metadata: CargoInstallMetadata;
}

export type CargoInstallResult = CargoInstallSuccess | InstallResultFailure;
