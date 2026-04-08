import type { InstallResultFailure, InstallResultSuccess } from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

/**
 * Metadata specific to curl-tar tool installation.
 */
export interface ICurlTarInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "curl-tar";
  tarballUrl: string;
}

/**
 * Success result for a curl-tar tool installation.
 */
export interface ICurlTarInstallSuccess extends InstallResultSuccess<ICurlTarInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: ICurlTarInstallMetadata;
}

/**
 * Result type for curl-tar tool installation (success or failure).
 */
export type CurlTarInstallResult = ICurlTarInstallSuccess | InstallResultFailure;
