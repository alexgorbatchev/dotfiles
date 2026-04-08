import { z } from "zod";
import { baseToolConfigPropertiesSchema } from "./base";
import { type PlatformConfigEntry, platformConfigEntrySchema } from "./platformConfigEntrySchema";

/**
 * Extended base tool config schema that includes platformConfigs.
 * This is defined in installer-plugin-system (not schemas) to avoid circular dependencies.
 *
 * Architecture:
 * - schemas package: baseToolConfigPropertiesSchema (no platform configs)
 * - plugin-system package: baseToolConfigWithPlatformsSchema (adds platform configs)
 * - plugin packages: extend from baseToolConfigWithPlatformsSchema
 *
 * This allows: schemas → plugins → plugin-system (no circular dependency)
 */
export const baseToolConfigWithPlatformsSchema = baseToolConfigPropertiesSchema.extend({
  /**
   * An array of platform-specific configurations.
   * Each entry defines configurations for a specific set of platforms and optionally architectures.
   */
  platformConfigs: z.array(platformConfigEntrySchema).optional(),
});

/**
 * Helper type for plugins to properly type their tool configs.
 * Plugins should use this instead of direct z.infer to get properly-typed platformConfigs.
 *
 * @example
 * ```typescript
 * export const myPluginToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
 *   installationMethod: z.literal('my-plugin'),
 *   installParams: myParamsSchema,
 * });
 *
 * export type MyPluginToolConfig = InferToolConfigWithPlatforms<typeof myPluginToolConfigSchema>;
 * ```
 */
export type InferToolConfigWithPlatforms<TSchema extends z.ZodType> = Omit<z.infer<TSchema>, "platformConfigs"> & {
  platformConfigs?: PlatformConfigEntry[];
};
