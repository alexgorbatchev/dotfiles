import type { BrewInstallParams } from './schemas';

/**
 * Install method signature for Brew plugin
 */
type BrewInstallMethod = (method: 'brew', params: BrewInstallParams) => unknown;

/**
 * Brew plugin definition for type-safe plugin registry.
 */
export declare const BrewPluginDefinition: {
  new (): {
    createInstallMethod(context: Record<string, unknown>): BrewInstallMethod;
  };
};
