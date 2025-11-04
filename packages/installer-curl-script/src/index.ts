export * from './CurlScriptInstallerPlugin';
export * from './CurlScriptPluginDefinition';
export * from './installFromCurlScript';
export * from './schemas';
export * from './types';

// Module augmentation for curl-script plugin
import type { RegisterPluginResult } from '@dotfiles/core';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    'curl-script': import('./schemas').CurlScriptInstallParams;
  }
  interface ToolConfigRegistry {
    'curl-script': import('./schemas').CurlScriptToolConfig;
  }
  interface PluginResultRegistry
    extends RegisterPluginResult<'curl-script', import('./types').CurlScriptInstallResult> {}
}
