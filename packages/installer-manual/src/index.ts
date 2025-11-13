export * from './ManualInstallerPlugin';
export * from './ManualPluginDefinition';
export * from './schemas';
export * from './types';

// Module augmentation for manual plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { ManualInstallParams, ManualToolConfig } from './schemas';
import type { ManualInstallResult } from './types';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    manual: ManualInstallParams;
  }
  interface ToolConfigRegistry {
    manual: ManualToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'manual', ManualInstallResult> {}
}
