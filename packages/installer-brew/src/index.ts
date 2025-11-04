export * from './BrewInstallerPlugin';
export * from './BrewPluginDefinition';
export * from './installFromBrew';
export * from './schemas';
export * from './types';

// Module augmentation for brew plugin
import type { RegisterPluginResult } from '@dotfiles/core';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    brew: import('./schemas').BrewInstallParams;
  }
  interface ToolConfigRegistry {
    brew: import('./schemas').BrewToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'brew', import('./types').BrewInstallResult> {}
}
