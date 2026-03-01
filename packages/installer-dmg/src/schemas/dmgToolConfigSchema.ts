import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from '@dotfiles/core';
import { z } from 'zod';
import { dmgInstallParamsSchema } from './dmgInstallParamsSchema';

export const dmgToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'dmg' installation method */
  installationMethod: z.literal('dmg'),
  /** DMG installation parameters */
  installParams: dmgInstallParamsSchema,
  /** Binaries are required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'dmg' installation method. */
export type DmgToolConfig = InferToolConfigWithPlatforms<typeof dmgToolConfigSchema>;
