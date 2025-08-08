import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const serviceWarningTemplates = {
  github: {
    notFound: (resource: string, identifier: string): SafeLogMessage => 
      createSafeLogMessage(`GitHub ${resource} not found: ${identifier}`),
  },
} as const;