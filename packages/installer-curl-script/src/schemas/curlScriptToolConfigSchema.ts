import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from "@dotfiles/core";
import { z } from "zod";
import { curlScriptInstallParamsSchema } from "./curlScriptInstallParamsSchema";

export const curlScriptToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'curl-script' installation method */
  installationMethod: z.literal("curl-script"),
  /** Curl script installation parameters */
  installParams: curlScriptInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'curl-script' installation method. */
export type CurlScriptToolConfig = InferToolConfigWithPlatforms<typeof curlScriptToolConfigSchema>;
