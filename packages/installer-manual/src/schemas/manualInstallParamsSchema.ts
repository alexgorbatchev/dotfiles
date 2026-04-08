import type { BaseInstallParams } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import { z } from "zod";

/**
 * Parameters for a "manual" installation method.
 * This method is used to install files from the tool configuration directory
 * (e.g., custom scripts, pre-built binaries, or other resources included with the dotfiles).
 * Hooks can be used to provide custom validation or setup steps.
 */
export const manualInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * The path to the binary file relative to the tool configuration file location.
   * If not specified, only shell configurations and symlinks will be processed.
   */
  binaryPath: z.string().min(1).optional(),
});

/**
 * Parameters for a "manual" installation method.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface ManualInstallParams extends BaseInstallParams {
  /**
   * The path to the binary file relative to the tool configuration file location.
   * If not specified, only shell configurations and symlinks will be processed.
   */
  binaryPath?: string;
}
