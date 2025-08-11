import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const architectureSuccessTemplates = {
  patterns: () => createSafeLogMessage('architecture patterns'),
  regexCreation: () => createSafeLogMessage('regex creation'),
  assetMatchCheck: (assetName: string) => createSafeLogMessage(`asset match check: ${assetName}`),
} satisfies SafeLogMessageMap;