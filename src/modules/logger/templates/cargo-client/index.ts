import { cargoClientDebugTemplates } from './debug';
import { cargoClientErrorTemplates } from './error';
import { cargoClientWarningTemplates } from './warning';

/**
 * Cargo API client operation templates grouped by log level
 */
export const cargoClient = {
  debug: cargoClientDebugTemplates,
  warning: cargoClientWarningTemplates,
  error: cargoClientErrorTemplates,
} as const;
