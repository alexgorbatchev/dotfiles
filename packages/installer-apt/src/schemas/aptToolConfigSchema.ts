import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from "@dotfiles/core";
import { z } from "zod";
import { aptInstallParamsSchema } from "./aptInstallParamsSchema";

export const aptToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'apt' installation method */
  installationMethod: z.literal("apt"),
  /** APT installation parameters */
  installParams: aptInstallParamsSchema,
  /** Binaries are resolved from PATH after the system package manager installs them. */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).optional(),
});

/** Resolved tool configuration for the 'apt' installation method. */
export type AptToolConfig = InferToolConfigWithPlatforms<typeof aptToolConfigSchema>;
