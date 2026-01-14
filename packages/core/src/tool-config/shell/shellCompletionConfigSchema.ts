import { z } from 'zod';

/**
 * Configuration for installing command-line completion for a specific shell.
 * Specifies either a source file from the extracted archive or a command to generate completions dynamically.
 */
export const shellCompletionConfigSchema = z
  .object({
    /**
     * Path to the completion script file relative to the extracted archive root.
     *
     * The path is automatically resolved during installation:
     * 1. Primary: Looks for the file in the extracted archive directory
     * 2. Fallback: Checks relative to the tool's config file if not found in archive
     *
     * When used with `url`, this is the path within the downloaded archive.
     *
     * @example
     * // For an archive that extracts to: tool-v1.0/
     * // And contains: tool-v1.0/completions/tool.zsh
     * source: 'completions/tool.zsh'
     *
     * // No context variables needed - path resolution is automatic during installation
     */
    source: z.string().min(1).optional(),
    /**
     * URL to download the completion file or archive from.
     * The file is downloaded to the tool's binary directory.
     *
     * - Direct file URL: `source` is optional (filename derived from URL)
     * - Archive URL: `source` required to specify path within the extracted archive
     *
     * @example
     * // Direct file download (source auto-derived as 'rg.zsh')
     * url: 'https://raw.githubusercontent.com/user/repo/main/rg.zsh'
     *
     * // Archive download (source required for path within archive)
     * url: 'https://github.com/user/repo/releases/download/v1.0/completions.tar.gz'
     * source: 'completions/tool.zsh'
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
    /**
     * Optional custom name for the installed completion script file.
     * Overrides both the default naming and the `bin` option.
     * If not provided, defaults to shell-specific naming (e.g., `_toolName` for Zsh).
     *
     * @example
     * name: '_my-custom-name'
     */
    name: z.string().optional(),
    /**
     * Optional custom directory where the completion script should be installed.
     * Must be an absolute path. Use config values like `ctx.projectConfig.paths.homeDir` when configuring.
     * If not provided, defaults to the shell-specific completion directory in generated files.
     *
     * @example
     * targetDir: `${ctx.projectConfig.paths.homeDir}/.zsh/completions`
     * targetDir: `${ctx.projectConfig.paths.generatedDir}/custom/completions`
     */
    targetDir: z.string().optional(),
  })
  .strict()
  .refine(
    (data) => {
      // Valid combinations:
      // 1. source only (local file)
      // 2. cmd only (generate via command)
      // 3. url only (direct file download, source auto-derived from URL)
      // 4. url + source (archive download with path within archive)
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
 * Specifies a source file, a command to generate completions, or a URL to download from.
 */
export type ShellCompletionConfig = z.infer<typeof shellCompletionConfigSchema>;
