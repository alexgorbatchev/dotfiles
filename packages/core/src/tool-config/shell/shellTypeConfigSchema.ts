import { z } from 'zod';
import { shellCompletionConfigSchema } from './shellCompletionConfigSchema';
import { shellScriptSchema } from './shellScriptSchema';

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
    /** Shell completion configuration */
    completions: shellCompletionConfigSchema.optional(),
  })
  .strict();
