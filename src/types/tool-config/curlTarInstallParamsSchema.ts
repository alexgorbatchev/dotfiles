import { z } from 'zod';
import { baseInstallParamsSchema } from './baseInstallParamsSchema';

/**
 * Parameters for installing a tool by downloading a tarball (`.tar`, `.tar.gz`, etc.) using `curl`,
 * then extracting it and potentially moving a binary from within.
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
  /**
   * An optional path within the extracted tarball that points to the specific file or directory
   * to be considered the primary artifact (e.g., `bin/mytool` if the tarball extracts to a root folder
   * and the binary is inside `bin/`). If not provided, the entire extracted content might be used,
   * or auto-detection might occur.
   */
  extractPath: z.string().optional(),
  /**
   * The number of leading directory components to strip from file paths during tarball extraction.
   * @default 0
   */
  stripComponents: z.number().int().min(0).optional(),
});

/**
 * Parameters for installing a tool by downloading a tarball (`.tar`, `.tar.gz`, etc.) using `curl`,
 * then extracting it and potentially moving a binary from within.
 * This is analogous to Zinit's `dl` ice for archives, combined with `extract` and `pick`.
 */
export type CurlTarInstallParams = z.infer<typeof curlTarInstallParamsSchema>;
