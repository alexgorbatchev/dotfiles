import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from '../../base/baseToolConfigPropertiesSchema';
import { binaryConfigSchema } from '../../base/binaryConfigSchema';
import type { ToolConfig } from '../../toolConfigSchema';
import { brewInstallParamsSchema } from './brewInstallParamsSchema';

export const brewToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  /** Resolved tool configuration for the 'brew' installation method */
  installationMethod: z.literal('brew'),
  /** Homebrew installation parameters */
  installParams: brewInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'brew' installation method. */
export type BrewToolConfig = z.infer<typeof brewToolConfigSchema>;

/**
 * Type guard to check if a config is a Brew tool config
 */
export function isBrewToolConfig(config: ToolConfig): config is BrewToolConfig {
  return config.installationMethod === 'brew';
}
