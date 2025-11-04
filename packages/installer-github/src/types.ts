import type { OperationFailure, OperationSuccess } from '@dotfiles/installer';

/**
 * Metadata for GitHub Release installations
 */
export interface GitHubReleaseInstallMetadata {
  method: 'github-release';
  releaseUrl: string;
  publishedAt: string;
  releaseName: string;
  downloadUrl: string;
  assetName: string;
}

/**
 * Success result for GitHub Release installations
 */
export interface GitHubReleaseInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version: string;
  originalTag: string;
  metadata: GitHubReleaseInstallMetadata;
}

/**
 * Result type for GitHub Release installations
 */
export type GitHubReleaseInstallResult = GitHubReleaseInstallSuccess | OperationFailure;
