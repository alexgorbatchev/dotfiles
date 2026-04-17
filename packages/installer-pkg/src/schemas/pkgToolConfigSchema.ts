import { baseToolConfigWithPlatformsSchema, type InferToolConfigWithPlatforms } from "@dotfiles/core";
import { z } from "zod";
import { pkgInstallParamsSchema } from "./pkgInstallParamsSchema";

export const pkgToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  installationMethod: z.literal("pkg"),
  installParams: pkgInstallParamsSchema,
});

export type PkgToolConfig = InferToolConfigWithPlatforms<typeof pkgToolConfigSchema>;
