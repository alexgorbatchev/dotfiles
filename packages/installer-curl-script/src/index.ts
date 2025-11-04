import type { CurlScriptInstallParams } from '@dotfiles/schemas';

export * from './CurlScriptInstallerPlugin';
export * from './installFromCurlScript';
export * from './types';

declare module '@dotfiles/tool-config-builder' {
  interface ToolConfigBuilder {
    install(method: 'curl-script', params: CurlScriptInstallParams): this;
  }
}
