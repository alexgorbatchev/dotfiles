export * from './BrewInstallerPlugin';
export * from './installFromBrew';
export * from './schemas';
export * from './types';

// Module augmentation for brew plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { BrewInstallParams, BrewToolConfig } from './schemas';
import type { BrewInstallResult } from './types';

declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    brew: BrewInstallParams;
  }
  interface IToolConfigRegistry {
    brew: BrewToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<'brew', BrewInstallResult> {}
  interface IRequireBinMethodRegistry {
    brew: true;
  }
}
