export * from './gitea-client';
export * from './GiteaReleaseInstallerPlugin';
export * from './installFromGiteaRelease';
export * from './schemas';
export * from './types';

import type { RegisterPluginResult } from '@dotfiles/core';
import type { GiteaReleaseInstallParams, GiteaReleaseToolConfig } from './schemas';
import type { GiteaReleaseInstallResult } from './types';

declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    'gitea-release': GiteaReleaseInstallParams;
  }
  interface IToolConfigRegistry {
    'gitea-release': GiteaReleaseToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<'gitea-release', GiteaReleaseInstallResult> {}
}
