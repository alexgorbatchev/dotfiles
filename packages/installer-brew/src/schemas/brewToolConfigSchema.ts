import {
  baseToolConfigWithPlatformsSchema,
  type InferToolConfigWithPlatforms,
} from '@dotfiles/core';
import { z } from 'zod';
import { brewInstallParamsSchema } from './brewInstallParamsSchema';

export const brewToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'brew' installation method */
  installationMethod: z.literal('brew'),
  /** Homebrew installation parameters */
  installParams: brewInstallParamsSchema,
});

/** Resolved tool configuration for the 'brew' installation method. */
export type BrewToolConfig = InferToolConfigWithPlatforms<typeof brewToolConfigSchema>;
