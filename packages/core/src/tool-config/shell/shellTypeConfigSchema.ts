import type { Resolvable } from '@dotfiles/unwrap-value';
import { z } from 'zod';
import type { ShellCompletionConfigInput } from '../../builder';
import type { ShellScript } from '../../shell';
import { shellScriptSchema } from './shellScriptSchema';

/**
 * Input type for path configuration - can be static or resolved via callback.
 */
export type PathConfigInput = Resolvable<void, string>;

export const shellTypeConfigSchema = z
  .object({
    /** Shell initialization scripts */
    scripts: z.array(shellScriptSchema).optional(),
    /** Shell aliases (alias name -> command) */
    aliases: z.record(z.string(), z.string()).optional(),
    /** Environment variables to define (variable name -> value) */
    environment: z.record(z.string(), z.string()).optional(),
    /** Shell functions (function name -> body) */
    functions: z.record(z.string(), z.string()).optional(),
    /** Paths to add to PATH environment variable */
    paths: z.array(z.unknown()).optional(),
    /**
     * Shell completion configuration (static value or callback).
     * Accepts string, ShellCompletionConfig object, or callback function.
     * Validation happens at generation time after resolution.
     */
    completions: z.unknown().optional(),
  })
  .strict();

/**
 * Configuration for a specific shell type (zsh, bash, powershell).
 * Manually typed to properly represent ShellCompletionConfigInput.
 */
export interface ShellTypeConfig {
  /** Shell initialization scripts */
  scripts?: ShellScript[];
  /** Shell aliases (alias name -> command) */
  aliases?: Record<string, string>;
  /** Environment variables to define (variable name -> value) */
  environment?: Record<string, string>;
  /** Shell functions (function name -> body) */
  functions?: Record<string, string>;
  /**
   * Paths to add to PATH environment variable.
   * Paths are deduplicated during shell init generation.
   */
  paths?: PathConfigInput[];
  /**
   * Shell completion configuration.
   * Can be a static string path, config object, or callback function.
   */
  completions?: ShellCompletionConfigInput;
}
