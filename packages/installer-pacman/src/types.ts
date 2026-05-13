import type { InstallResultFailure, InstallResultSuccess } from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

export interface IPacmanInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "pacman";
  packageName: string;
}

export interface IPacmanInstallSuccess extends InstallResultSuccess<IPacmanInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: IPacmanInstallMetadata;
}

export type PacmanInstallResult = IPacmanInstallSuccess | InstallResultFailure;
