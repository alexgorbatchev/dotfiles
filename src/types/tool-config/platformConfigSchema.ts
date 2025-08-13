import { z } from 'zod';
import { brewInstallParamsSchema } from './brewInstallParamsSchema';
import { completionConfigSchema } from './completionConfigSchema';
import { curlScriptInstallParamsSchema } from './curlScriptInstallParamsSchema';
import { curlTarInstallParamsSchema } from './curlTarInstallParamsSchema';
import { githubReleaseInstallParamsSchema } from './githubReleaseInstallParamsSchema';
import { manualInstallParamsSchema } from './manualInstallParamsSchema';
import { shellConfigsSchema } from './shellConfigsSchema';
import { symlinkConfigSchema } from './symlinkConfigSchema';
import { toolConfigUpdateCheckSchema } from './toolConfigUpdateCheckSchema';

export const platformConfigSchema = z
  .object({
    /** An array of binary names that should have shims generated for this tool */
    binaries: z.array(z.string().min(1)).optional(),
    /** The desired version of the tool */
    version: z.string().optional(),
    /** Shell configurations organized by shell type */
    shellConfigs: shellConfigsSchema.optional(),
    /** An array of symlink configurations */
    symlinks: z.array(symlinkConfigSchema).optional(),
    /** Shell completion configurations */
    completions: completionConfigSchema.optional(),
    /** Configuration for automatic update checking for this tool */
    updateCheck: toolConfigUpdateCheckSchema.optional(),
    /** The installation method to use */
    installationMethod: z.enum(['github-release', 'brew', 'curl-script', 'curl-tar', 'manual', 'none']).optional(),
    /** Parameters specific to the installation method */
    installParams: z
      .union([
        githubReleaseInstallParamsSchema,
        brewInstallParamsSchema,
        curlScriptInstallParamsSchema,
        curlTarInstallParamsSchema,
        manualInstallParamsSchema,
      ])
      .optional(),
  })
  .strict();

/**
 * Configuration overrides that can be applied in platform-specific configurations.
 * This includes all tool configuration properties except name and platformConfigs
 * to avoid circular references.
 */
export type PlatformConfig = z.infer<typeof platformConfigSchema>;
