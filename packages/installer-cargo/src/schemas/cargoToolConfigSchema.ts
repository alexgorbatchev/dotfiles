import type { ToolConfig } from '@dotfiles/core';
import { baseToolConfigWithPlatformsSchema, type InferToolConfigWithPlatforms } from '@dotfiles/core';
import { z } from 'zod';
import { cargoInstallParamsSchema } from './cargoInstallParamsSchema';

/**
 * Zod schema for Cargo tool configuration
 */
export const cargoToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
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
export type CargoToolConfig = InferToolConfigWithPlatforms<typeof cargoToolConfigSchema>;

/**
 * Type guard to check if a config is a Cargo tool config
 */
export function isCargoToolConfig(config: ToolConfig): config is CargoToolConfig {
  return config.installationMethod === 'cargo';
}
