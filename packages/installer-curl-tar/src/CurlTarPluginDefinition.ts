import type { CurlTarInstallParams } from './schemas';

/**
 * Install method signature for Curl Tar plugin
 */
type CurlTarInstallMethod = (method: 'curl-tar', params: CurlTarInstallParams) => unknown;

/**
 * Curl Tar plugin definition for type-safe plugin registry.
 */
export declare const CurlTarPluginDefinition: {
  new (): {
    createInstallMethod(context: Record<string, unknown>): CurlTarInstallMethod;
  };
};
