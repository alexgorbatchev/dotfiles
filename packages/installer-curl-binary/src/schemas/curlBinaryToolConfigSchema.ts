import {
  baseToolConfigWithPlatformsSchema,
  binaryConfigSchema,
  type InferToolConfigWithPlatforms,
} from "@dotfiles/core";
import { z } from "zod";
import { curlBinaryInstallParamsSchema } from "./curlBinaryInstallParamsSchema";

export const curlBinaryToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'curl-binary' installation method */
  installationMethod: z.literal("curl-binary"),
  /** Curl binary installation parameters */
  installParams: curlBinaryInstallParamsSchema,
  /** Binaries are typically required for this installation method */
  binaries: z.array(z.union([z.string().min(1), binaryConfigSchema])).min(1),
});

/** Resolved tool configuration for the 'curl-binary' installation method. */
export type CurlBinaryToolConfig = InferToolConfigWithPlatforms<typeof curlBinaryToolConfigSchema>;
