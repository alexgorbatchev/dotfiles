import type { BaseInstallParams } from "@dotfiles/core";
import { baseToolConfigWithPlatformsSchema, type InferToolConfigWithPlatforms } from "@dotfiles/core";
import { z } from "zod";
import { cargoInstallParamsSchema } from "./cargoInstallParamsSchema";

/**
 * Zod schema for Cargo tool configuration
 */
export const cargoToolConfigSchema = baseToolConfigWithPlatformsSchema.extend({
  installationMethod: z.literal("cargo"),
  installParams: cargoInstallParamsSchema,
});

/**
 * Installation parameters for Cargo-based tools using pre-compiled binaries.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface CargoInstallParams extends BaseInstallParams {
  /** The crate name */
  crateName: string;
  /** Source for binaries - either cargo-quickinstall or GitHub releases */
  binarySource?: "cargo-quickinstall" | "github-releases";
  /** GitHub repository for the crate (required for github-releases source). Format: "owner/repo" */
  githubRepo?: string;
  /** Asset pattern for GitHub releases. Supports placeholders: {version}, {platform}, {arch}, {crateName} */
  assetPattern?: string;
  /** Version source - where to get the version information */
  versionSource?: "cargo-toml" | "crates-io" | "github-releases";
  /** Custom Cargo.toml URL if different from standard GitHub location */
  cargoTomlUrl?: string;
}

/**
 * Tool configuration for Cargo-based installations
 */
export type CargoToolConfig = InferToolConfigWithPlatforms<typeof cargoToolConfigSchema>;
