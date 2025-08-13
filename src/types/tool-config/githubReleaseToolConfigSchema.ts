import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from './baseToolConfigPropertiesSchema';
import { githubReleaseInstallParamsSchema } from './githubReleaseInstallParamsSchema';

export const githubReleaseToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  /** Resolved tool configuration for the 'github-release' installation method */
  installationMethod: z.literal('github-release'),
  /** GitHub release installation parameters */
  installParams: githubReleaseInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.string().min(1)).min(1),
});

/** Resolved tool configuration for the 'github-release' installation method. */
export type GithubReleaseToolConfig = z.infer<typeof githubReleaseToolConfigSchema>;
