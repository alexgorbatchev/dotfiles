import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from "@dotfiles/core";
import { z } from "zod";
import { pacmanInstallParamsSchema } from "./pacmanInstallParamsSchema";

export const pacmanToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'pacman' installation method */
  installationMethod: z.literal("pacman"),
  /** pacman installation parameters */
  installParams: pacmanInstallParamsSchema,
  /** Binaries are resolved from PATH after the system package manager installs them. */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).optional(),
});

/** Resolved tool configuration for the 'pacman' installation method. */
export type PacmanToolConfig = InferToolConfigWithPlatforms<typeof pacmanToolConfigSchema>;
