import type { ToolConfig } from '@dotfiles/core';
import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from '@dotfiles/core';
import { z } from 'zod';
import { curlScriptInstallParamsSchema } from './curlScriptInstallParamsSchema';

export const curlScriptToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'curl-script' installation method */
  installationMethod: z.literal('curl-script'),
  /** Curl script installation parameters */
  installParams: curlScriptInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'curl-script' installation method. */
export type CurlScriptToolConfig = InferToolConfigWithPlatforms<typeof curlScriptToolConfigSchema>;

/**
 * Type guard to check if a config is a Curl Script tool config
 */
export function isCurlScriptToolConfig(config: ToolConfig): config is CurlScriptToolConfig {
  return config.installationMethod === 'curl-script';
}
