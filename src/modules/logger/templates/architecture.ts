import { architectureSuccessTemplates } from './architecture/success';

/**
 * Architecture pattern detection and processing templates grouped by log level
 */
export const architecture = {
  success: architectureSuccessTemplates,
} as const;