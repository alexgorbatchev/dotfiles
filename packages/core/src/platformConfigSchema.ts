import type { z } from 'zod';
import { commonToolConfigPropertiesSchema } from './tool-config';

/**
 * Platform configuration schema for runtime validation.
 * Platform configs contain common tool properties that can be overridden per-platform.
 * They do NOT contain installationMethod or installParams - those belong to the tool config.
 */
export const platformConfigSchema = commonToolConfigPropertiesSchema.strict();

/**
 * Platform configuration type - contains common tool properties.
 * Used for platform-specific overrides in tool configurations.
 */
export type PlatformConfig = z.infer<typeof platformConfigSchema>;

/**
 * @deprecated Use platformConfigSchema
 */
export const basePlatformConfigSchema = platformConfigSchema;
