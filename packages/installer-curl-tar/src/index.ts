export * from './CurlTarInstallerPlugin';
export * from './CurlTarPluginDefinition';
export * from './installFromCurlTar';
export * from './schemas';
export * from './types';

// Module augmentation for curl-tar plugin
import type { RegisterPluginResult } from '@dotfiles/core';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    'curl-tar': import('./schemas').CurlTarInstallParams;
  }
  interface ToolConfigRegistry {
    'curl-tar': import('./schemas').CurlTarToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'curl-tar', import('./types').CurlTarInstallResult> {}
}
