import type { ICommandCompletionMeta } from './types';

/**
 * Completion metadata for the generate command.
 * Defined separately to avoid circular dependencies with generateZshCompletion.ts.
 */
export const GENERATE_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'generate',
  description: 'Generate shims, shell init files, and symlinks',
  options: [{ flag: '--overwrite', description: 'Overwrite conflicting files not created by generator' }],
};
