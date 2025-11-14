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
type CargoInstallSchemaParams = z.infer<typeof cargoInstallParamsSchema>;

export interface CargoInstallParams extends BaseInstallParams {
  crateName: CargoInstallSchemaParams['crateName'];
  binarySource?: CargoInstallSchemaParams['binarySource'];
  githubRepo?: CargoInstallSchemaParams['githubRepo'];
  assetPattern?: CargoInstallSchemaParams['assetPattern'];
  versionSource?: CargoInstallSchemaParams['versionSource'];
  cargoTomlUrl?: CargoInstallSchemaParams['cargoTomlUrl'];
  customBinaries?: CargoInstallSchemaParams['customBinaries'];
  allowSourceFallback?: CargoInstallSchemaParams['allowSourceFallback'];
}

/**
 * Tool configuration for Cargo-based installations
 */
export type CargoToolConfig = InferToolConfigWithPlatforms<typeof cargoToolConfigSchema>;
