import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const downloaderSuccessTemplates = {
  downloadFrom: (strategyName: string) => createSafeLogMessage(`download from ${strategyName}`),
  readFileForCaching: (path: string) => createSafeLogMessage(`read file for caching: ${path}`),
} satisfies SafeLogMessageMap;
