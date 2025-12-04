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
     * @example
     * // For an archive that extracts to: tool-v1.0/
     * // And contains: tool-v1.0/completions/tool.zsh
     * source: 'completions/tool.zsh'
     *
     * // No context variables needed - path resolution is automatic during installation
     */
    source: z.string().min(1).optional(),
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
     * Must be an absolute path. Use context variables like `ctx.homeDir` when configuring.
     * If not provided, defaults to the shell-specific completion directory in generated files.
     *
     * @example
     * targetDir: `${ctx.homeDir}/.zsh/completions`
     * targetDir: `${ctx.generatedDir}/custom/completions`
     */
    targetDir: z.string().optional(),
  })
  .strict()
  .refine((data) => (data.source && !data.cmd) || (!data.source && data.cmd), {
    message: "Either 'source' or 'cmd' must be provided, but not both",
  });

/**
 * Configuration for installing command-line completion for a specific shell.
 * Specifies either a source file from the extracted archive or a command to generate completions dynamically.
 */
export type ShellCompletionConfig = z.infer<typeof shellCompletionConfigSchema>;
