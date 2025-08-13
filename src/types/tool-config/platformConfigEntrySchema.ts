import { z } from 'zod';
import { platformConfigSchema } from './platformConfigSchema';

export const platformConfigEntrySchema = z
  .object({
    /** A bitmask of target platforms for this configuration. */
    platforms: z.number().int().min(0),
    /** An optional bitmask of target architectures for this configuration. If undefined, applies to all architectures on the specified platforms. */
    architectures: z.number().int().min(0).optional(),
    /** The actual configuration settings for this platform/architecture combination. */
    config: platformConfigSchema,
  })
  .strict();

/**
 * Represents a single platform-specific configuration entry.
 * It specifies the target platforms (and optionally architectures) and the
 * configuration overrides that apply to them.
 */
export type PlatformConfigEntry = z.infer<typeof platformConfigEntrySchema>;
