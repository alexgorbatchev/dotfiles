import type { BaseInstallParams } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import { z } from "zod";

export const brewInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * The name of the Homebrew formula to install (e.g., `ripgrep`).
   * Either `formula` or `cask` (by setting `cask: true` and using `formula` for the cask name) should be specified.
   */
  formula: z.string().optional(),
  /**
   * If `true`, the `formula` property is treated as a Homebrew Cask name (e.g., `visual-studio-code`).
   * @default false
   */
  cask: z.boolean().optional(),
  /**
   * An optional Homebrew tap or an array of taps that need to be added (`brew tap <tap_name>`)
   * before the formula can be installed.
   * Example: `homebrew/core` or `['user/custom-tap', 'another/tap']`.
   */
  tap: z.union([z.string(), z.array(z.string())]).optional(),
  /** Arguments to pass to the binary to check the version (e.g. ['--version']). */
  versionArgs: z.array(z.string()).optional(),
  /** Regex to extract version from output. */
  versionRegex: z.string().optional(),
});

/**
 * Parameters for installing a tool using Homebrew (`brew`).
 * This method is typically used on macOS and Linux (via Linuxbrew).
 * It involves running `brew install` commands.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface IBrewInstallParams extends BaseInstallParams {
  /** The name of the Homebrew formula to install (e.g., `ripgrep`). */
  formula?: string;
  /** If `true`, the `formula` property is treated as a Homebrew Cask name. */
  cask?: boolean;
  /** An optional Homebrew tap or an array of taps. */
  tap?: string | string[];
  /** Arguments to pass to the binary to check the version. */
  versionArgs?: string[];
  /** Regex to extract version from output. */
  versionRegex?: string;
}

export type BrewInstallParams = IBrewInstallParams;
