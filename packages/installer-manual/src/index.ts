import type { ManualInstallParams } from '@dotfiles/schemas';

export * from './ManualInstallerPlugin';
export * from './installManually';
export * from './types';

declare module '@dotfiles/tool-config-builder' {
  interface ToolConfigBuilder {
    install(method: 'manual', params: ManualInstallParams): this;
  }
}
