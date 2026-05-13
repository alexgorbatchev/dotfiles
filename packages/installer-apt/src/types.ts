import type { InstallResultFailure, InstallResultSuccess } from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

export interface IAptInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "apt";
  packageName: string;
}

export interface IAptInstallSuccess extends InstallResultSuccess<IAptInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: IAptInstallMetadata;
}

export type AptInstallResult = IAptInstallSuccess | InstallResultFailure;
