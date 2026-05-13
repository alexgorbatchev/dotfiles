import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from "@dotfiles/core";
import { z } from "zod";
import { dnfInstallParamsSchema } from "./dnfInstallParamsSchema";

export const dnfToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'dnf' installation method */
  installationMethod: z.literal("dnf"),
  /** DNF installation parameters */
  installParams: dnfInstallParamsSchema,
  /** Binaries are resolved from PATH after the system package manager installs them. */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).optional(),
});

/** Resolved tool configuration for the 'dnf' installation method. */
export type DnfToolConfig = InferToolConfigWithPlatforms<typeof dnfToolConfigSchema>;
