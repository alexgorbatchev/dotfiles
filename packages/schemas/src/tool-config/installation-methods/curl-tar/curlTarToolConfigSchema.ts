import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from '../../base/baseToolConfigPropertiesSchema';
import { binaryConfigSchema } from '../../base/binaryConfigSchema';
import type { ToolConfig } from '../../toolConfigSchema';
import { curlTarInstallParamsSchema } from './curlTarInstallParamsSchema';

export const curlTarToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  /** Resolved tool configuration for the 'curl-tar' installation method */
  installationMethod: z.literal('curl-tar'),
  /** Curl tar installation parameters */
  installParams: curlTarInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'curl-tar' installation method. */
export type CurlTarToolConfig = z.infer<typeof curlTarToolConfigSchema>;

/**
 * Type guard to check if a config is a Curl Tar tool config
 */
export function isCurlTarToolConfig(config: ToolConfig): config is CurlTarToolConfig {
  return config.installationMethod === 'curl-tar';
}
