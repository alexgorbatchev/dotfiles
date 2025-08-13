import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from './baseToolConfigPropertiesSchema';

export const noInstallToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  /** Indicates that no top-level installation method is specified */
  installationMethod: z.literal('none'),
  /** Installation parameters are explicitly undefined or absent for this type */
  installParams: z.undefined().optional(),
});

/**
 * Resolved tool configuration for tools that do not have a primary installation method defined
 * at the top level (e.g., they might only consist of Zsh initializations, symlinks, or rely entirely
 * on architecture-specific overrides for installation).
 * The `binaries` property is optional here, inherited from BaseToolConfigProperties.
 */
export type NoInstallToolConfig = z.infer<typeof noInstallToolConfigSchema>;
