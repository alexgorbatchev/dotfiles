export * from './BrewInstallerPlugin';
export * from './installFromBrew';
export * from './schemas';
export * from './types';

// Module augmentation for brew plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { BrewInstallParams, BrewToolConfig } from './schemas';
import type { BrewInstallResult } from './types';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    brew: BrewInstallParams;
  }
  interface ToolConfigRegistry {
    brew: BrewToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'brew', BrewInstallResult> {}
}
