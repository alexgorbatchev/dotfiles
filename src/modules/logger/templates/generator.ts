import { generatorDebugTemplates } from './generator/debug';

/**
 * Generator operation templates grouped by log level
 */
export const generator = {
  debug: generatorDebugTemplates,
} as const;