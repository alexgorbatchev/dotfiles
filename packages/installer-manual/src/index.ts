export * from './ManualInstallerPlugin';
export * from './schemas';
export * from './types';

// Module augmentation for manual plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { ManualInstallParams, ManualToolConfig } from './schemas';
import type { ManualInstallResult } from './types';

declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    manual: ManualInstallParams;
  }
  interface IToolConfigRegistry {
    manual: ManualToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<'manual', ManualInstallResult> {}
}
