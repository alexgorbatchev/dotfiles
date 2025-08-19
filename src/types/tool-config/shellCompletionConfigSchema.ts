import { z } from 'zod';

/**
 * Configuration for installing command-line completion for a specific shell.
 * It specifies either the source of the completion file within an extracted archive,
 * or a command to generate the completion content dynamically.
 */
export const shellCompletionConfigSchema = z
  .object({
    /**
     * The path to the completion script file within the extracted archive of a tool.
     * For example, if a tool's archive extracts to `tool-v1.0/` and contains `tool-v1.0/completions/tool.zsh`,
     * this path would be `completions/tool.zsh` (relative to the `extractedDir` provided to `installCompletions`).
     */
    source: z.string().min(1).optional(),
    /**
     * A command to execute to generate completion content dynamically.
     * The command will be executed in the tool's installation directory.
     * For example: 'my-tool completion zsh' or 'kubectl completion bash'
     */
    cmd: z.string().min(1).optional(),
    /**
     * An optional custom name for the installed completion script file.
     * If not provided, a default name is typically generated (e.g., `_toolName` for Zsh).
     */
    name: z.string().optional(),
    /**
     * An optional custom directory where the completion script should be installed.
     * If not provided, a default system or user-specific completion directory for the shell is used.
     */
    targetDir: z.string().optional(),
  })
  .strict()
  .refine((data) => (data.source && !data.cmd) || (!data.source && data.cmd), {
    message: "Either 'source' or 'cmd' must be provided, but not both",
  });

/**
 * Configuration for installing command-line completion for a specific shell.
 * It specifies either the source of the completion file within an extracted archive,
 * or a command to generate the completion content dynamically.
 */
export type ShellCompletionConfig = z.infer<typeof shellCompletionConfigSchema>;
