import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from '@dotfiles/core';
import { z } from 'zod';
import { manualInstallParamsSchema } from './manualInstallParamsSchema';

export const manualToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'manual' installation method */
  installationMethod: z.literal('manual'),
  /** Manual installation parameters */
  installParams: manualInstallParamsSchema.optional(),
  /** Binaries are optional for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).optional(),
});

/** Resolved tool configuration for the 'manual' installation method. */
export type ManualToolConfig = InferToolConfigWithPlatforms<typeof manualToolConfigSchema>;
