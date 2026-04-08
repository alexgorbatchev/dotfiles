import { z } from "zod";
import { architectureSchema, platformSchema } from "../common";
import type { PlatformConfig } from "../platformConfigSchema";

/**
 * Runtime schema for platform config entry structure.
 * Uses z.unknown() for config field because plugins register their types via module augmentation,
 * which zod cannot see. Runtime validation of the config field happens in the plugin system.
 */
export const platformConfigEntrySchema = z
  .object({
    /** A bitmask of target platforms for this configuration. */
    platforms: platformSchema,
    /** An optional bitmask of target architectures for this configuration. If undefined, applies to all architectures on the specified platforms. */
    architectures: architectureSchema.optional(),
    /** The actual configuration settings for this platform/architecture combination. */
    config: z.unknown(),
  })
  .strict();

/**
 * Base type inferred from schema (has config: unknown).
 */
export type BasePlatformConfigEntry = z.infer<typeof platformConfigEntrySchema>;

/**
 * Represents a single platform-specific configuration entry with fully-typed config.
 * The config field is properly typed as PlatformConfig (discriminated union built from
 * PlatformConfigRegistry that plugins augment via module augmentation).
 */
export type PlatformConfigEntry = Omit<BasePlatformConfigEntry, "config"> & {
  config: PlatformConfig;
};
