import { baseToolConfigWithPlatformsSchema, type InferToolConfigWithPlatforms } from '@dotfiles/core';
import { z } from 'zod';
import { zshPluginInstallParamsSchema } from './zshPluginInstallParamsSchema';

export const zshPluginToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'zsh-plugin' installation method */
  installationMethod: z.literal('zsh-plugin'),
  /** Zsh plugin installation parameters */
  installParams: zshPluginInstallParamsSchema,
  /** Binaries are optional for zsh plugins (usually none) */
  binaries: z.array(z.string().min(1)).default([]),
});

/** Resolved tool configuration for the 'zsh-plugin' installation method. */
export type ZshPluginToolConfig = InferToolConfigWithPlatforms<typeof zshPluginToolConfigSchema>;
