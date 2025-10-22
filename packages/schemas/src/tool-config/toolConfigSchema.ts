import { z } from 'zod';
import { brewToolConfigSchema } from './installation-methods/brew/brewToolConfigSchema';
import { cargoToolConfigSchema } from './installation-methods/cargo/cargoToolConfigSchema';
import { curlScriptToolConfigSchema } from './installation-methods/curl-script/curlScriptToolConfigSchema';
import { curlTarToolConfigSchema } from './installation-methods/curl-tar/curlTarToolConfigSchema';
import { githubReleaseToolConfigSchema } from './installation-methods/github-release/githubReleaseToolConfigSchema';
import { manualToolConfigSchema } from './installation-methods/manual/manualToolConfigSchema';
import { noInstallToolConfigSchema } from './installation-methods/noInstallToolConfigSchema';

export const toolConfigSchema = z.discriminatedUnion('installationMethod', [
  githubReleaseToolConfigSchema,
  brewToolConfigSchema,
  cargoToolConfigSchema,
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
