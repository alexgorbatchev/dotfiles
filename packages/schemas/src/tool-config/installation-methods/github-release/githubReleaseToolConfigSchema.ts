import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from '../../base/baseToolConfigPropertiesSchema';
import { binaryConfigSchema } from '../../base/binaryConfigSchema';
import { githubReleaseInstallParamsSchema } from './githubReleaseInstallParamsSchema';

export const githubReleaseToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  /** Resolved tool configuration for the 'github-release' installation method */
  installationMethod: z.literal('github-release'),
  /** GitHub release installation parameters */
  installParams: githubReleaseInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'github-release' installation method. */
export type GithubReleaseToolConfig = z.infer<typeof githubReleaseToolConfigSchema>;
