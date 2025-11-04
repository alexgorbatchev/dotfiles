import type { BrewInstallParams } from '@dotfiles/schemas';

export * from './BrewInstallerPlugin';
export * from './installFromBrew';
export * from './types';

declare module '@dotfiles/tool-config-builder' {
  interface ToolConfigBuilder {
    install(method: 'brew', params: BrewInstallParams): this;
  }
}
