import { z } from 'zod';
import { shellCompletionConfigSchema } from './shellCompletionConfigSchema';

/**
 * Defines the overall completion configuration for a tool, potentially spanning multiple shells.
 * Each property corresponds to a ShellType and holds its specific ShellCompletionConfig.
 */
export const completionConfigSchema = z
  .object({
    /** Configuration for Zsh completions. */
    zsh: shellCompletionConfigSchema.optional(),
    /** Configuration for Bash completions. */
    bash: shellCompletionConfigSchema.optional(),
    /** Configuration for PowerShell completions. */
    powershell: shellCompletionConfigSchema.optional(),
  })
  .strict();

/**
 * Defines the overall completion configuration for a tool, potentially spanning multiple shells.
 * Each property corresponds to a ShellType and holds its specific ShellCompletionConfig.
 */
export type CompletionConfig = z.infer<typeof completionConfigSchema>;
