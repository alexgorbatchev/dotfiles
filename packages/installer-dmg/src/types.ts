import type { InstallResultFailure, InstallResultSuccess } from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

export interface IDmgInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "dmg";
  dmgUrl: string;
}

export interface IDmgInstallSuccess extends InstallResultSuccess<IDmgInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: IDmgInstallMetadata;
}

export type DmgInstallResult = IDmgInstallSuccess | InstallResultFailure;
