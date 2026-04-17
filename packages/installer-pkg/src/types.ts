import type { InstallResultFailure, InstallResultSuccess } from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

export interface IPkgInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "pkg";
  pkgUrl: string;
  target: string;
}

export interface IPkgInstallSuccess extends InstallResultSuccess<IPkgInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: IPkgInstallMetadata;
}

export type PkgInstallResult = IPkgInstallSuccess | InstallResultFailure;
