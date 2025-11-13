import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

export interface BrewInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'brew';
  formula: string;
  isCask: boolean;
  tap?: string | string[];
}

export interface BrewInstallSuccess extends InstallResultSuccess<BrewInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: BrewInstallMetadata;
}

export type BrewInstallResult = BrewInstallSuccess | InstallResultFailure;
