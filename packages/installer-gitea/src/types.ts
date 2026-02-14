import type { InstallResultFailure, InstallResultSuccess } from '@dotfiles/core';
import type { IToolInstallationDetails } from '@dotfiles/registry';

export interface IGiteaReleaseInstallMetadata extends Partial<IToolInstallationDetails> {
  method: 'gitea-release';
  releaseUrl: string;
  publishedAt: string;
  releaseName: string;
  instanceUrl: string;
}

export interface IGiteaReleaseInstallSuccess extends InstallResultSuccess<IGiteaReleaseInstallMetadata> {
  binaryPaths: string[];
  version: string;
  originalTag: string;
  metadata: IGiteaReleaseInstallMetadata;
}

export type GiteaReleaseInstallResult = IGiteaReleaseInstallSuccess | InstallResultFailure;
