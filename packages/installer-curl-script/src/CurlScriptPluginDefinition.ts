import type { CurlScriptInstallParams } from './schemas';

/**
 * Install method signature for Curl Script plugin
 */
type CurlScriptInstallMethod = (method: 'curl-script', params: CurlScriptInstallParams) => unknown;

/**
 * Curl Script plugin definition for type-safe plugin registry.
 */
export declare const CurlScriptPluginDefinition: {
  new (): {
    createInstallMethod(context: Record<string, unknown>): CurlScriptInstallMethod;
  };
};
