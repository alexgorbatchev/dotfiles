import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from './baseToolConfigPropertiesSchema';
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
