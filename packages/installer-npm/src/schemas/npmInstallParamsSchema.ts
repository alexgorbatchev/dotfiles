import type { IBaseInstallParams } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import { z } from "zod";

export const npmInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * The npm package name to install (e.g., `prettier`, `@angular/cli`).
   * If not specified, the tool name is used as the package name.
   */
  package: z.string().min(1).optional(),
  /**
   * The version or version range to install (e.g., `3.0.0`, `latest`).
   * If not specified, the latest version is installed.
   */
  version: z.string().optional(),
  /** The package manager to use for installation. Defaults to `'npm'`. */
  packageManager: z.enum(["npm", "bun"]).optional(),
});

/**
 * Parameters for installing a tool using npm.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface INpmInstallParams extends IBaseInstallParams {
  /** The npm package name to install. */
  package?: string;
  /** The version or version range to install. */
  version?: string;
  /** The package manager to use for installation. Defaults to `'npm'`. */
  packageManager?: "npm" | "bun";
}
