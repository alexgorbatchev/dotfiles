import type { ToolConfig } from '@dotfiles/core';
import { z } from 'zod';
import { commonToolConfigPropertiesSchema } from './tool-config';

/**
 * Platform configuration schema for runtime validation.
 * Platform configs contain common tool properties that can be overridden per-platform.
 * Additionally, they can override installationMethod and installParams to use different
 * installation strategies per platform.
 */
export const platformConfigSchema = commonToolConfigPropertiesSchema
  .extend({
    /** Optional platform-specific installation method override. */
    installationMethod: z.string().optional(),
    /** Optional platform-specific installation parameters override. */
    installParams: z.unknown().optional(),
  })
  .strict();

/**
 * Platform configuration type - contains common tool properties plus optional installation overrides.
 * Used for platform-specific overrides in tool configurations.
 * 
 * The runtime schema validates with loose types (string, unknown), but the TypeScript type
 * is properly constrained to match the ToolConfig discriminated union.
 */
export type PlatformConfig = Omit<z.infer<typeof platformConfigSchema>, 'installationMethod' | 'installParams'> & {
  installationMethod?: ToolConfig['installationMethod'];
  installParams?: ToolConfig['installParams'];
};
