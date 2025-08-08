import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const downloaderSuccessTemplates = {
  downloadFrom: (strategyName: string): SafeLogMessage => createSafeLogMessage(`download from ${strategyName}`),
  readFileForCaching: (path: string): SafeLogMessage => createSafeLogMessage(`read file for caching: ${path}`),
} as const;