import type { BaseInstallParams } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import { z } from "zod";
import type { CurlScriptArgs, CurlScriptEnv } from "../types";

/**
 * Parameters for installing a tool by downloading and executing a shell script using `curl`.
 * This method involves fetching a script from a URL and piping it to a shell.
 * Example: `curl -fsSL <url> | sh`.
 * This is analogous to Zinit's `dl` ice combined with `atclone` for script execution.
 * @example Zinit equivalent:
 * \`\`\`zsh
 * zinit ice dl"https://install.sh/myscript" atclone"sh myscript"
 * zinit snippet "https://install.sh/myscript"
 * \`\`\`
 */
export const curlScriptInstallParamsSchema = baseInstallParamsSchema.extend({
  /** The URL of the installation script to download. */
  url: z.string().url(),
  /** The shell to use for executing the downloaded script (e.g., `bash`, `sh`). */
  shell: z.enum(["bash", "sh"]),
  /** Arguments to pass to the script - can be static array or function returning array. */
  args: z.custom<CurlScriptArgs>().optional(),
  /** Environment variables to pass to the script - can be static object or function returning object. */
  env: z.custom<CurlScriptEnv>().optional(),
  /** Arguments to pass to the binary to check the version (e.g. ['--version']). */
  versionArgs: z.array(z.string()).optional(),
  /** Regex to extract version from output. */
  versionRegex: z.string().optional(),
});

/**
 * Parameters for installing a tool by downloading and executing a shell script using `curl`.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 * Uses Omit because `env` has a more specific type than BaseInstallParams.env.
 */
export interface CurlScriptInstallParams extends Omit<BaseInstallParams, "env"> {
  /** The URL of the installation script to download. */
  url: string;
  /** The shell to use for executing the downloaded script. */
  shell: "bash" | "sh";
  /** Arguments to pass to the script - can be static array or function returning array. */
  args?: CurlScriptArgs;
  /** Environment variables to pass to the script - can be static object or function returning object. */
  env?: CurlScriptEnv;
  /** Arguments to pass to the binary to check the version. */
  versionArgs?: string[];
  /** Regex to extract version from output. */
  versionRegex?: string;
}
