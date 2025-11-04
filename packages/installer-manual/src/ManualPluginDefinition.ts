import type { ManualInstallParams } from './schemas';

/**
 * Install method signature for Manual plugin
 */
type ManualInstallMethod = (method: 'manual', params: ManualInstallParams) => unknown;

/**
 * Manual plugin definition for type-safe plugin registry.
 */
export declare const ManualPluginDefinition: {
  new (): {
    createInstallMethod(context: Record<string, unknown>): ManualInstallMethod;
  };
};
