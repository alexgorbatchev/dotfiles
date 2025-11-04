import type { CargoInstallParams } from './schemas';

/**
 * Install method signature for Cargo plugin
 */
type CargoInstallMethod = (method: 'cargo', params: CargoInstallParams) => unknown;

/**
 * Cargo plugin definition for type-safe plugin registry.
 */
export declare const CargoPluginDefinition: {
  new (): {
    createInstallMethod(context: Record<string, unknown>): CargoInstallMethod;
  };
};
