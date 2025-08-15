import { z } from 'zod';
import { brewInstallParamsSchema } from './brewInstallParamsSchema';
import { cargoInstallParamsSchema } from './cargoInstallParamsSchema';
import { commonToolConfigPropertiesSchema } from './commonToolConfigPropertiesSchema';
import { curlScriptInstallParamsSchema } from './curlScriptInstallParamsSchema';
import { curlTarInstallParamsSchema } from './curlTarInstallParamsSchema';
import { githubReleaseInstallParamsSchema } from './githubReleaseInstallParamsSchema';
import { manualInstallParamsSchema } from './manualInstallParamsSchema';

export const platformConfigSchema = commonToolConfigPropertiesSchema
  .extend({
    /** The installation method to use */
    installationMethod: z
      .enum(['github-release', 'brew', 'curl-script', 'curl-tar', 'cargo', 'manual', 'none'])
      .optional(),
    /** Parameters specific to the installation method */
    installParams: z
      .union([
        githubReleaseInstallParamsSchema,
        brewInstallParamsSchema,
        curlScriptInstallParamsSchema,
        curlTarInstallParamsSchema,
        cargoInstallParamsSchema,
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
