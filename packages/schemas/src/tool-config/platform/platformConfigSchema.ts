import { z } from 'zod';
import { commonToolConfigPropertiesSchema } from '../base/commonToolConfigPropertiesSchema';
import { brewInstallParamsSchema } from '../installation-methods/brew/brewInstallParamsSchema';
import { cargoInstallParamsSchema } from '../installation-methods/cargo/cargoInstallParamsSchema';
import { curlScriptInstallParamsSchema } from '../installation-methods/curl-script/curlScriptInstallParamsSchema';
import { curlTarInstallParamsSchema } from '../installation-methods/curl-tar/curlTarInstallParamsSchema';
import { githubReleaseInstallParamsSchema } from '../installation-methods/github-release/githubReleaseInstallParamsSchema';
import { manualInstallParamsSchema } from '../installation-methods/manual/manualInstallParamsSchema';

export const platformConfigSchema = commonToolConfigPropertiesSchema
  .extend({
    /** The installation method to use */
    installationMethod: z.enum(['github-release', 'brew', 'curl-script', 'curl-tar', 'cargo', 'manual']).optional(),
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
