export * from './CargoInstallerPlugin';
export * from './CargoPluginDefinition';
export * from './cargo-client';
export * from './installFromCargo';
export * from './schemas';
export * from './types';

// Module augmentation for cargo plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { CargoInstallParams, CargoToolConfig } from './schemas';
import type { CargoInstallResult } from './types';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    cargo: CargoInstallParams;
  }
  interface ToolConfigRegistry {
    cargo: CargoToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'cargo', CargoInstallResult> {}
}
