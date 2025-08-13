import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from './baseToolConfigPropertiesSchema';
import { manualInstallParamsSchema } from './manualInstallParamsSchema';

export const manualToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  /** Resolved tool configuration for the 'manual' installation method */
  installationMethod: z.literal('manual'),
  /** Manual installation parameters */
  installParams: manualInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.string().min(1)).min(1),
});

/** Resolved tool configuration for the 'manual' installation method. */
export type ManualToolConfig = z.infer<typeof manualToolConfigSchema>;
