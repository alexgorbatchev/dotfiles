export * from './CurlTarInstallerPlugin';
export * from './installFromCurlTar';
export * from './schemas';
export * from './types';

// Module augmentation for curl-tar plugin
import type { RegisterPluginResult } from '@dotfiles/core';
import type { CurlTarInstallParams, CurlTarToolConfig } from './schemas';
import type { CurlTarInstallResult } from './types';

declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    'curl-tar': CurlTarInstallParams;
  }
  interface IToolConfigRegistry {
    'curl-tar': CurlTarToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<'curl-tar', CurlTarInstallResult> {}
}
