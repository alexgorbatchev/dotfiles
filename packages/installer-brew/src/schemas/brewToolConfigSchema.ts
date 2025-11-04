import type { ToolConfig } from '@dotfiles/core';
import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from '@dotfiles/core';
import { z } from 'zod';
import { brewInstallParamsSchema } from './brewInstallParamsSchema';

export const brewToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'brew' installation method */
  installationMethod: z.literal('brew'),
  /** Homebrew installation parameters */
  installParams: brewInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'brew' installation method. */
export type BrewToolConfig = InferToolConfigWithPlatforms<typeof brewToolConfigSchema>;

/**
 * Type guard to check if a config is a Brew tool config
 */
export function isBrewToolConfig(config: ToolConfig): config is BrewToolConfig {
  return config.installationMethod === 'brew';
}
