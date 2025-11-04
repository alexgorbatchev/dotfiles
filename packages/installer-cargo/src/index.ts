export * from './CargoInstallerPlugin';
export * from './CargoPluginDefinition';
export * from './cargo-client';
export * from './installFromCargo';
export * from './schemas';
export * from './types';

// Module augmentation for cargo plugin
import type { RegisterPluginResult } from '@dotfiles/core';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    cargo: import('./schemas').CargoInstallParams;
  }
  interface ToolConfigRegistry {
    cargo: import('./schemas').CargoToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'cargo', import('./types').CargoInstallResult> {}
}
