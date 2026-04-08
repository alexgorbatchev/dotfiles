import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from "@dotfiles/core";
import { z } from "zod";
import { npmInstallParamsSchema } from "./npmInstallParamsSchema";

export const npmToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'npm' installation method */
  installationMethod: z.literal("npm"),
  /** npm installation parameters */
  installParams: npmInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'npm' installation method. */
export type NpmToolConfig = InferToolConfigWithPlatforms<typeof npmToolConfigSchema>;
