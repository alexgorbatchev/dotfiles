import { z } from 'zod';
import { brewToolConfigSchema } from './brewToolConfigSchema';
import { curlScriptToolConfigSchema } from './curlScriptToolConfigSchema';
import { curlTarToolConfigSchema } from './curlTarToolConfigSchema';
import { githubReleaseToolConfigSchema } from './githubReleaseToolConfigSchema';
import { manualToolConfigSchema } from './manualToolConfigSchema';
import { noInstallToolConfigSchema } from './noInstallToolConfigSchema';

export const toolConfigSchema = z.discriminatedUnion('installationMethod', [
  githubReleaseToolConfigSchema,
  brewToolConfigSchema,
  curlScriptToolConfigSchema,
  curlTarToolConfigSchema,
  manualToolConfigSchema,
  noInstallToolConfigSchema,
]);

/**
 * Represents a tool's complete, resolved configuration after being processed by the `ToolConfigBuilder`.
 * This is a discriminated union based on the `installationMethod` property, allowing TypeScript
 * to correctly infer the type of `installParams` and other method-specific properties.
 */
export type ToolConfig = z.infer<typeof toolConfigSchema>;
