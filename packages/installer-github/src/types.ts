import type { OperationFailure, OperationSuccess } from '@dotfiles/core';
import type { ToolInstallationDetails } from '@dotfiles/registry';

/**
 * Metadata for GitHub Release installations
 */
export interface GitHubReleaseInstallMetadata extends Partial<ToolInstallationDetails> {
  method: 'github-release';
  releaseUrl: string;
  publishedAt: string;
  releaseName: string;
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
