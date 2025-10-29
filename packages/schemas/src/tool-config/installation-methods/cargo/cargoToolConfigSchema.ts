import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from '../../base/baseToolConfigPropertiesSchema';
import type { ToolConfig } from '../../toolConfigSchema';
import { cargoInstallParamsSchema } from './cargoInstallParamsSchema';

/**
 * Zod schema for Cargo tool configuration
 */
export const cargoToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  installationMethod: z.literal('cargo'),
  installParams: cargoInstallParamsSchema,
});

/**
 * Installation parameters for Cargo-based tools using pre-compiled binaries
 */
export type CargoInstallParams = z.infer<typeof cargoInstallParamsSchema>;

/**
 * Tool configuration for Cargo-based installations
 */
export type CargoToolConfig = z.infer<typeof cargoToolConfigSchema>;

/**
 * Type guard to check if a config is a Cargo tool config
 */
export function isCargoToolConfig(config: ToolConfig): config is CargoToolConfig {
  return config.installationMethod === 'cargo';
}
