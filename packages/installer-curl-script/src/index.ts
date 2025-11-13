export * from './CurlScriptInstallerPlugin';
export * from './CurlScriptPluginDefinition';
export * from './installFromCurlScript';
export * from './schemas';
export * from './types';

// Module augmentation for curl-script plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { CurlScriptInstallParams, CurlScriptToolConfig } from './schemas';
import type { CurlScriptInstallResult } from './types';

declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    'curl-script': CurlScriptInstallParams;
  }
  interface ToolConfigRegistry {
    'curl-script': CurlScriptToolConfig;
  }
  interface PluginResultRegistry
    extends RegisterPluginResult<'curl-script', CurlScriptInstallResult> {}
}
