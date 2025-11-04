import { baseInstallParamsSchema } from '@dotfiles/core';
import { z } from 'zod';

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
});

/**
 * Parameters for installing a tool using Homebrew (`brew`).
 * This method is typically used on macOS and Linux (via Linuxbrew).
 * It involves running `brew install` commands.
 */
export type BrewInstallParams = z.infer<typeof brewInstallParamsSchema>;
