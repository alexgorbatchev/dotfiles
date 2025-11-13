import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
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
export interface GitHubReleaseInstallSuccess extends InstallResultSuccess<GitHubReleaseInstallMetadata> {
  binaryPaths: string[];
  version: string;
  originalTag: string;
  metadata: GitHubReleaseInstallMetadata;
}

/**
 * Result type for GitHub Release installations
 */
export type GitHubReleaseInstallResult = GitHubReleaseInstallSuccess | InstallResultFailure;
