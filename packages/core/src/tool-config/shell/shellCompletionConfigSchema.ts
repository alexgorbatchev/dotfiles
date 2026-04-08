import { z } from 'zod';

/**
 * Configuration for installing command-line completion for a specific shell.
 * Specifies either a source file from the extracted archive or a command to generate completions dynamically.
 */
export const shellCompletionConfigSchema = z
  .object({
    /**
     * Path to a completion file.
     *
     * When used alone:
     * - **Relative paths** resolve to `toolDir` (directory containing `.tool.ts`)
     * - **Absolute paths** are used as-is (e.g., `${ctx.currentDir}/completions/_tool`)
     *
     * When used with `url`:
     * - Path within the extracted archive (e.g., `${ctx.currentDir}/completions/_tool`)
     * - The archive is extracted to `ctx.currentDir`
     *
     * @example
     * // Relative path (next to .tool.ts file)
     * source: '_tool.zsh'
     *
     * // From extracted archive
     * source: `${ctx.currentDir}/completions/_tool`
     */
    source: z.string().min(1).optional(),
    /**
     * URL to download the completion file or archive from.
     *
     * - Direct files can omit `source`; the filename is derived from the URL.
     * - Archives should provide `source` to identify the extracted completion file.
     *
     * @example
     * url: 'https://raw.githubusercontent.com/user/repo/main/completions/_tool'
     *
     * @example
     * url: 'https://github.com/user/repo/releases/download/v1.0/completions.tar.gz'
     * source: `${ctx.currentDir}/completions/_tool`
     */
    url: z.string().url().optional(),
    /**
     * Command to execute to generate completion content dynamically.
     * The command is executed in the tool's installation directory after installation.
     *
     * @example
     * cmd: 'my-tool completion zsh'
     * cmd: 'kubectl completion bash'
     */
    cmd: z.string().min(1).optional(),
    /**
     * Optional binary name for the completion file.
     * When provided, shell-specific naming conventions are applied (e.g., `_bin` for Zsh, `bin.bash` for Bash).
     * Use this when the tool filename differs from the binary name.
     *
     * @example
     * // For a tool file named 'curl-script--fnm.tool.ts' with binary 'fnm'
     * bin: 'fnm'  // Results in '_fnm' for zsh, 'fnm.bash' for bash
     */
    bin: z.string().optional(),
  })
  .strict()
  .refine(
    (data) => {
      // Valid combinations:
      // 1. source only (local file - relative or absolute)
      // 2. cmd only (generate via command)
      // 3. url only (direct file download)
      // 4. url + source (archive download or explicit source path)
      const hasSource = Boolean(data.source);
      const hasCmd = Boolean(data.cmd);
      const hasUrl = Boolean(data.url);

      if (hasCmd && hasUrl) return false; // cmd and url are mutually exclusive
      if (hasCmd && hasSource) return false; // cmd and source are mutually exclusive
      if (!hasSource && !hasCmd && !hasUrl) return false; // must have source, cmd, or url

      return true;
    },
    {
      message:
        "Invalid completion config: use 'source' alone, 'cmd' alone, 'url' alone, or 'url' with 'source'. Cannot combine 'cmd' with 'url' or 'source'.",
    },
  );

/**
 * Configuration for installing command-line completion for a specific shell.
 * Specifies a source file, a command to generate completions, or a URL to download an archive from.
 */
export type ShellCompletionConfig = z.infer<typeof shellCompletionConfigSchema>;
