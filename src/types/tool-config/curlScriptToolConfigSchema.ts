import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from './baseToolConfigPropertiesSchema';
import { curlScriptInstallParamsSchema } from './curlScriptInstallParamsSchema';

export const curlScriptToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  /** Resolved tool configuration for the 'curl-script' installation method */
  installationMethod: z.literal('curl-script'),
  /** Curl script installation parameters */
  installParams: curlScriptInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.string().min(1)).min(1),
});

/** Resolved tool configuration for the 'curl-script' installation method. */
export type CurlScriptToolConfig = z.infer<typeof curlScriptToolConfigSchema>;
