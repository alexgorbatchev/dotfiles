import { z } from 'zod';
import { shellTypeConfigSchema } from './shellTypeConfigSchema';

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
 * Shell configuration organized by shell type
 */
export type ShellConfigs = z.infer<typeof shellConfigsSchema>;
