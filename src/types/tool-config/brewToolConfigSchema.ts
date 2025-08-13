import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from './baseToolConfigPropertiesSchema';
import { brewInstallParamsSchema } from './brewInstallParamsSchema';

export const brewToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  /** Resolved tool configuration for the 'brew' installation method */
  installationMethod: z.literal('brew'),
  /** Homebrew installation parameters */
  installParams: brewInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.string().min(1)).min(1),
});

/** Resolved tool configuration for the 'brew' installation method. */
export type BrewToolConfig = z.infer<typeof brewToolConfigSchema>;
