import type { ToolConfig } from "@dotfiles/core";
import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from "@dotfiles/core";
import { z } from "zod";
import { githubReleaseInstallParamsSchema } from "./githubReleaseInstallParamsSchema";

export const githubReleaseToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'github-release' installation method */
  installationMethod: z.literal("github-release"),
  /** GitHub release installation parameters */
  installParams: githubReleaseInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/**
 * Resolved tool configuration for the 'github-release' installation method.
 * Uses InferToolConfigWithPlatforms to properly type platformConfigs with PlatformConfigEntry[].
 */
export type GithubReleaseToolConfig = InferToolConfigWithPlatforms<typeof githubReleaseToolConfigSchema>;

/**
 * Type guard to check if a config is a GitHub Release tool config
 */
export function isGitHubReleaseToolConfig(config: ToolConfig): config is GithubReleaseToolConfig {
  return config.installationMethod === "github-release";
}
