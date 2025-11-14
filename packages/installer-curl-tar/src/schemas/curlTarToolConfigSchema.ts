import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from '@dotfiles/core';
import { z } from 'zod';
import { curlTarInstallParamsSchema } from './curlTarInstallParamsSchema';

export const curlTarToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'curl-tar' installation method */
  installationMethod: z.literal('curl-tar'),
  /** Curl tar installation parameters */
  installParams: curlTarInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'curl-tar' installation method. */
export type CurlTarToolConfig = InferToolConfigWithPlatforms<typeof curlTarToolConfigSchema>;
