import { baseToolConfigWithPlatformsSchema, type InferToolConfigWithPlatforms } from "@dotfiles/core";
import { z } from "zod";
import { dmgInstallParamsSchema } from "./dmgInstallParamsSchema";

export const dmgToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  /** Resolved tool configuration for the 'dmg' installation method */
  installationMethod: z.literal("dmg"),
  /** DMG installation parameters */
  installParams: dmgInstallParamsSchema,
});

/** Resolved tool configuration for the 'dmg' installation method. */
export type DmgToolConfig = InferToolConfigWithPlatforms<typeof dmgToolConfigSchema>;
