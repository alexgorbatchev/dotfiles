export * from './ManualInstallerPlugin';
export * from './ManualPluginDefinition';
export * from './schemas';
export * from './types';

// Module augmentation for manual plugin
import type { RegisterPluginResult } from '@dotfiles/core';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    manual: import('./schemas').ManualInstallParams;
  }
  interface ToolConfigRegistry {
    manual: import('./schemas').ManualToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'manual', import('./types').ManualInstallResult> {}
}
