import { cargoClientDebugTemplates } from './debug';

/**
 * Cargo API client operation templates grouped by log level
 */
export const cargoClient = {
  debug: cargoClientDebugTemplates,
} as const;
