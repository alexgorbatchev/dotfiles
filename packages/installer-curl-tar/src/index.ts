export * from './CurlTarInstallerPlugin';
export * from './CurlTarPluginDefinition';
export * from './installFromCurlTar';
export * from './schemas';
export * from './types';

// Module augmentation for curl-tar plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { CurlTarInstallParams, CurlTarToolConfig } from './schemas';
import type { CurlTarInstallResult } from './types';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    'curl-tar': CurlTarInstallParams;
  }
  interface ToolConfigRegistry {
    'curl-tar': CurlTarToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'curl-tar', CurlTarInstallResult> {}
}
