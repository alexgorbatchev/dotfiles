import { z } from 'zod';
import { shellTypeConfigSchema } from './shellTypeConfigSchema';
import type { ShellTypeConfig } from './shellTypeConfigSchema';

export const shellConfigsSchema = z
  .object({
    /** Zsh shell configuration */
    zsh: shellTypeConfigSchema.optional(),
    /** Bash shell configuration */
    bash: shellTypeConfigSchema.optional(),
    /** PowerShell configuration */
    powershell: shellTypeConfigSchema.optional(),
  })
  .strict();

/**
 * Shell configuration organized by shell type.
 * Manually typed to properly represent ShellCompletionConfigInput in completions.
 */
export interface ShellConfigs {
  /** Zsh shell configuration */
  zsh?: ShellTypeConfig;
  /** Bash shell configuration */
  bash?: ShellTypeConfig;
  /** PowerShell configuration */
  powershell?: ShellTypeConfig;
}
