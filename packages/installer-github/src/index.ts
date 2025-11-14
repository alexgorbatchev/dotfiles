export * from './GitHubReleaseInstallerPlugin';
export * from './github-client';
export * from './installFromGitHubRelease';
export * from './schemas';
export * from './types';

// Module augmentation for github-release plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { GithubReleaseInstallParams, GithubReleaseToolConfig } from './schemas';
import type { GitHubReleaseInstallResult } from './types';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    'github-release': GithubReleaseInstallParams;
  }
  interface ToolConfigRegistry {
    'github-release': GithubReleaseToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'github-release', GitHubReleaseInstallResult> {}
}
