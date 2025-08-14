import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from './baseToolConfigPropertiesSchema';
import { binaryConfigSchema } from './binaryConfigSchema';
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
