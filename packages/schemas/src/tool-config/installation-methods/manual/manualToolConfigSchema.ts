import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from '../../base/baseToolConfigPropertiesSchema';
import { binaryConfigSchema } from '../../base/binaryConfigSchema';
import type { ToolConfig } from '../../toolConfigSchema';
import { manualInstallParamsSchema } from './manualInstallParamsSchema';

export const manualToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  /** Resolved tool configuration for the 'manual' installation method */
  installationMethod: z.literal('manual'),
  /** Manual installation parameters */
  installParams: manualInstallParamsSchema.optional(),
  /** Binaries are optional for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).optional(),
});

/** Resolved tool configuration for the 'manual' installation method. */
export type ManualToolConfig = z.infer<typeof manualToolConfigSchema>;

/**
 * Type guard to check if a config is a Manual tool config
 */
export function isManualToolConfig(config: ToolConfig): config is ManualToolConfig {
  return config.installationMethod === 'manual';
}
