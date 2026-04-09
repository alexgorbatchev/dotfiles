import { z } from "zod";
import type { IShellTypeConfig } from "./shellTypeConfigSchema";
import { shellTypeConfigSchema } from "./shellTypeConfigSchema";

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
export interface IShellConfigs {
  /** Zsh shell configuration */
  zsh?: IShellTypeConfig;
  /** Bash shell configuration */
  bash?: IShellTypeConfig;
  /** PowerShell configuration */
  powershell?: IShellTypeConfig;
}
