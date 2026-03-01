import type { BaseInstallParams } from '@dotfiles/core';
import { baseInstallParamsSchema } from '@dotfiles/core';
import { z } from 'zod';

export const dmgInstallParamsSchema = baseInstallParamsSchema.extend({
  /** The URL of the DMG file to download. */
  url: z.string().url(),
  /**
   * The name of the .app bundle inside the DMG (e.g., 'MyApp.app').
   * If not provided, the first .app bundle found will be used.
   */
  appName: z.string().optional(),
  /**
   * Relative path to the binary inside the .app bundle.
   * Defaults to Contents/MacOS/{binary name from .bin()}.
   * Example: 'Contents/MacOS/myapp'
   */
  binaryPath: z.string().optional(),
  /** Arguments to pass to the binary to check the version (e.g. ['--version']). */
  versionArgs: z.array(z.string()).optional(),
  /** Regex to extract version from output. */
  versionRegex: z.string().optional(),
});

/**
 * Parameters for installing a tool from a macOS DMG disk image.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface DmgInstallParams extends BaseInstallParams {
  /** The URL of the DMG file to download. */
  url: string;
  /** The name of the .app bundle inside the DMG. */
  appName?: string;
  /** Relative path to the binary inside the .app bundle. */
  binaryPath?: string;
  /** Arguments to pass to the binary to check the version. */
  versionArgs?: string[];
  /** Regex to extract version from output. */
  versionRegex?: string;
}
