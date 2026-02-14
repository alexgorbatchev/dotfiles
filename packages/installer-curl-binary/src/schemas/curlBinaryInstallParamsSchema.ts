import type { BaseInstallParams } from '@dotfiles/core';
import { baseInstallParamsSchema } from '@dotfiles/core';
import { z } from 'zod';

/**
 * Parameters for installing a tool by downloading a standalone binary file using `curl`.
 * Unlike `curl-tar`, the downloaded file IS the binary — no archive extraction is performed.
 *
 * @example
 * ```typescript
 * defineTool((install) =>
 *   install('curl-binary', {
 *     url: 'https://example.com/tool-v1.0.0-linux-amd64',
 *   }).bin('my-tool')
 * );
 * ```
 */
export const curlBinaryInstallParamsSchema = baseInstallParamsSchema.extend({
  /** The URL of the binary file to download. */
  url: z.string().url(),
  /** Arguments to pass to the binary to check the version (e.g. ['--version']). */
  versionArgs: z.array(z.string()).optional(),
  /** Regex to extract version from output. */
  versionRegex: z.string().optional(),
});

/**
 * Parameters for installing a tool by downloading a standalone binary file.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface CurlBinaryInstallParams extends BaseInstallParams {
  /** The URL of the binary file to download. */
  url: string;
  /** Arguments to pass to the binary to check the version. */
  versionArgs?: string[];
  /** Regex to extract version from output. */
  versionRegex?: string;
}
