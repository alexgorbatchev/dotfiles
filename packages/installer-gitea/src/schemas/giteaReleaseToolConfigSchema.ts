import type { ToolConfig } from "@dotfiles/core";
import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from "@dotfiles/core";
import { z } from "zod";
import { giteaReleaseInstallParamsSchema } from "./giteaReleaseInstallParamsSchema";

export const giteaReleaseToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  installationMethod: z.literal("gitea-release"),
  installParams: giteaReleaseInstallParamsSchema,
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

export type GiteaReleaseToolConfig = InferToolConfigWithPlatforms<typeof giteaReleaseToolConfigSchema>;

export function isGiteaReleaseToolConfig(config: ToolConfig): config is GiteaReleaseToolConfig {
  return config.installationMethod === "gitea-release";
}
