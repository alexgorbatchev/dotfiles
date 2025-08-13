import { z } from 'zod';

/**
 * Configuration for installing command-line completion for a specific shell.
 * It specifies the source of the completion file within an extracted archive,
 * an optional custom name for the completion script, and an optional custom target directory.
 */
export const shellCompletionConfigSchema = z
  .object({
    /**
     * The path to the completion script file within the extracted archive of a tool.
     * For example, if a tool's archive extracts to `tool-v1.0/` and contains `tool-v1.0/completions/tool.zsh`,
     * this path would be `completions/tool.zsh` (relative to the `extractedDir` provided to `installCompletions`).
     */
    source: z.string().min(1),
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
  .strict();

/**
 * Configuration for installing command-line completion for a specific shell.
 * It specifies the source of the completion file within an extracted archive,
 * an optional custom name for the completion script, and an optional custom target directory.
 */
export type ShellCompletionConfig = z.infer<typeof shellCompletionConfigSchema>;
