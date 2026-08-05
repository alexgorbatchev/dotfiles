import type { IBaseInstallParams } from "@dotfiles/core";
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
  /**
   * Tap(s) or formula(s) to explicitly trust before tapping/installing (`brew trust <target>`).
   * Required for Homebrew 6.0+ non-official third-party taps.
   */
  trust: z.union([z.string(), z.array(z.string())]).optional(),
  /**
   * Additional CLI flags to pass directly to `brew install`
   * (e.g., `['--HEAD']`, `['--build-from-source']`, `['--no-quarantine']`).
   */
  args: z.array(z.string()).optional(),
  /**
   * Manage Homebrew background service after installation (`brew services start|run <formula>`).
   */
  service: z.union([z.boolean(), z.enum(["start", "run"])]).optional(),
  /**
   * Force symlinking keg-only or conflicting formulas (`brew link [--overwrite] [--force] <formula>`).
   */
  link: z
    .union([
      z.boolean(),
      z.object({
        force: z.boolean().optional(),
        overwrite: z.boolean().optional(),
      }),
    ])
    .optional(),
  /** Arguments to pass to the binary to check the version (e.g. ['--version']). */
  versionArgs: z.array(z.string()).optional(),
  /** Regex pattern or source string used to extract the version from output. */
  versionRegex: z.union([z.string(), z.instanceof(RegExp)]).optional(),
});

/**
 * Parameters for installing a tool using Homebrew (`brew`).
 * This method is typically used on macOS and Linux (via Linuxbrew).
 * It involves running `brew install` commands.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface IBrewInstallParams extends IBaseInstallParams {
  /** The name of the Homebrew formula to install (e.g., `ripgrep`). */
  formula?: string;
  /** If `true`, the `formula` property is treated as a Homebrew Cask name. */
  cask?: boolean;
  /** An optional Homebrew tap or an array of taps. */
  tap?: string | string[];
  /** Tap(s) or formula(s) to explicitly trust before tapping/installing (`brew trust <target>`). */
  trust?: string | string[];
  /** Additional CLI flags to pass directly to `brew install`. */
  args?: string[];
  /** Manage Homebrew background service after installation (`brew services start|run <formula>`). */
  service?: boolean | "start" | "run";
  /** Force symlinking keg-only or conflicting formulas (`brew link [--overwrite] [--force] <formula>`). */
  link?: boolean | { force?: boolean; overwrite?: boolean };
  /** Arguments to pass to the binary to check the version. */
  versionArgs?: string[];
  /** Regex pattern or source string used to extract the version from output. */
  versionRegex?: string | RegExp;
}
