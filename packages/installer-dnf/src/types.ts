import type { InstallResultFailure, InstallResultSuccess } from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

export interface IDnfInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "dnf";
  packageName: string;
}

export interface IDnfInstallSuccess extends InstallResultSuccess<IDnfInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: IDnfInstallMetadata;
}

export type DnfInstallResult = IDnfInstallSuccess | InstallResultFailure;
