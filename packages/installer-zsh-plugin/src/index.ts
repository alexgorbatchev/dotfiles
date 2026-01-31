export * from './installFromZshPlugin';
export * from './schemas';
export * from './types';
export * from './ZshPluginInstallerPlugin';

// Module augmentation for zsh-plugin plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { ZshPluginInstallParams, ZshPluginToolConfig } from './schemas';
import type { ZshPluginInstallResult } from './types';

declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    'zsh-plugin': ZshPluginInstallParams;
  }
  interface IToolConfigRegistry {
    'zsh-plugin': ZshPluginToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<'zsh-plugin', ZshPluginInstallResult> {}
}
