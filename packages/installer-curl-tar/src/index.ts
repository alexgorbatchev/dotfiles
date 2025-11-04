import type { CurlTarInstallParams } from '@dotfiles/schemas';

export * from './CurlTarInstallerPlugin';
export * from './installFromCurlTar';
export * from './types';

declare module '@dotfiles/tool-config-builder' {
  interface ToolConfigBuilder {
    install(method: 'curl-tar', params: CurlTarInstallParams): this;
  }
}
