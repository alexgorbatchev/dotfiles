import { generatorDebugTemplates } from './debug';

/**
 * Generator operation templates grouped by log level
 */
export const generator = {
  debug: generatorDebugTemplates,
} as const;
