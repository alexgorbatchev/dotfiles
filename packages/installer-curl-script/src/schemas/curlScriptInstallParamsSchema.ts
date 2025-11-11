import type { BaseInstallParams } from '@dotfiles/core';
import { baseInstallParamsSchema } from '@dotfiles/core';
import { z } from 'zod';

/**
 * Parameters for installing a tool by downloading and executing a shell script using `curl`.
 * This method involves fetching a script from a URL and piping it to a shell.
 * Example: `curl -fsSL <url> | sh`.
 * This is analogous to Zinit's `dl` ice combined with `atclone` for script execution.
 * @example Zinit equivalent:
 * ```zsh
 * zinit ice dl"https://install.sh/myscript" atclone"sh myscript"
 * zinit snippet "https://install.sh/myscript"
 * ```
 */
export const curlScriptInstallParamsSchema = baseInstallParamsSchema.extend({
  /** The URL of the installation script to download. */
  url: z.string().url(),
  /** The shell to use for executing the downloaded script (e.g., `bash`, `sh`). */
  shell: z.enum(['bash', 'sh']),
});

/**
 * Parameters for installing a tool by downloading and executing a shell script using `curl`.
 * This method involves fetching a script from a URL and piping it to a shell.
 * Example: `curl -fsSL <url> | sh`.
 * This is analogous to Zinit's `dl` ice combined with `atclone` for script execution.
 */
type CurlScriptSchemaParams = z.infer<typeof curlScriptInstallParamsSchema>;

export interface CurlScriptInstallParams extends BaseInstallParams {
  url: CurlScriptSchemaParams['url'];
  shell: CurlScriptSchemaParams['shell'];
}
