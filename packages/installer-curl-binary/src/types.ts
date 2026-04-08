import type { InstallResultFailure, InstallResultSuccess } from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

/**
 * Metadata specific to curl-binary tool installation.
 */
export interface ICurlBinaryInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "curl-binary";
  binaryUrl: string;
}

/**
 * Success result for a curl-binary tool installation.
 */
export interface ICurlBinaryInstallSuccess extends InstallResultSuccess<ICurlBinaryInstallMetadata> {
  binaryPaths: string[];
  version?: string;
  metadata: ICurlBinaryInstallMetadata;
}

/**
 * Result type for curl-binary tool installation (success or failure).
 */
export type CurlBinaryInstallResult = ICurlBinaryInstallSuccess | InstallResultFailure;
