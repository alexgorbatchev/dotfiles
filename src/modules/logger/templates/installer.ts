import { installerDebugTemplates } from './installer/debug';

/**
 * Installer operation templates grouped by log level
 */
export const installer = {
  debug: installerDebugTemplates,
} as const;