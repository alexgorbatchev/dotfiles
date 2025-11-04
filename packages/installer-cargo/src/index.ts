import type { CargoInstallParams } from '@dotfiles/schemas';

export * from './CargoInstallerPlugin';
export * from './installFromCargo';
export * from './types';

declare module '@dotfiles/tool-config-builder' {
  interface ToolConfigBuilder {
    install(method: 'cargo', params: CargoInstallParams): this;
  }
}
