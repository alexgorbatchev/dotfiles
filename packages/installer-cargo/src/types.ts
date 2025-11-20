import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { IToolInstallationDetails } from '@dotfiles/registry';

export interface ICargoInstallMetadata extends Partial<IToolInstallationDetails> {
  method: 'cargo';
  crateName: string;
  binarySource: string;
}

export interface ICargoInstallSuccess extends InstallResultSuccess<ICargoInstallMetadata> {
  binaryPaths: string[];
  version: string;
  originalTag?: string;
  metadata: ICargoInstallMetadata;
}

export type CargoInstallResult = ICargoInstallSuccess | InstallResultFailure;
