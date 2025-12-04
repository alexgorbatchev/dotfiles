import type { BaseInstallParams } from '@dotfiles/core';
import { baseInstallParamsSchema } from '@dotfiles/core';
import { z } from 'zod';

/**
 * Parameters for installing a tool by downloading a tarball (`.tar`, `.tar.gz`, etc.) using `curl`,
 * then extracting it and locating binaries using patterns.
 * This is analogous to Zinit's `dl` ice for archives, combined with `extract` and `pick`.
 * @example Zinit equivalent:
 * ```zsh
 * zinit ice dl"https://example.com/tool.tar.gz" extract pick"bin/tool" # Conceptual
 * zinit light "user/tool-from-tarball"
 * ```
 */
export const curlTarInstallParamsSchema = baseInstallParamsSchema.extend({
  /** The URL of the tarball to download. */
  url: z.string().url(),
  /** Arguments to pass to the binary to check the version (e.g. ['--version']). */
  versionArgs: z.array(z.string()).optional(),
  /** Regex to extract version from output. */
  versionRegex: z.string().optional(),
});

/**
 * Parameters for installing a tool by downloading a tarball (`.tar`, `.tar.gz`, etc.) using `curl`,
 * then extracting it and potentially moving a binary from within.
 * This is analogous to Zinit's `dl` ice for archives, combined with `extract` and `pick`.
 */
export type CurlTarInstallParams = BaseInstallParams & z.infer<typeof curlTarInstallParamsSchema>;
