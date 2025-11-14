import type { BaseInstallParams } from '@dotfiles/core';
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
export type CargoInstallParams = BaseInstallParams & z.infer<typeof cargoInstallParamsSchema>;

/**
 * Tool configuration for Cargo-based installations
 */
export type CargoToolConfig = InferToolConfigWithPlatforms<typeof cargoToolConfigSchema>;
