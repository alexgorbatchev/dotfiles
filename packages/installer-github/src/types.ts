import type { InstallResultFailure, InstallResultSuccess } from "@dotfiles/core";
import type { IToolInstallationDetails } from "@dotfiles/registry";

/**
 * Metadata for GitHub Release installations
 */
export interface IGitHubReleaseInstallMetadata extends Partial<IToolInstallationDetails> {
  method: "github-release";
  releaseUrl: string;
  publishedAt: string;
  releaseName: string;
}

/**
 * Success result for GitHub Release installations
 */
export interface IGitHubReleaseInstallSuccess extends InstallResultSuccess<IGitHubReleaseInstallMetadata> {
  binaryPaths: string[];
  version: string;
  originalTag: string;
  metadata: IGitHubReleaseInstallMetadata;
}

/**
 * Result type for GitHub Release installations
 */
export type GitHubReleaseInstallResult = IGitHubReleaseInstallSuccess | InstallResultFailure;
