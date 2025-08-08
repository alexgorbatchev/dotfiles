import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const architectureSuccessTemplates = {
  patterns: (): SafeLogMessage => createSafeLogMessage('architecture patterns'),
  regexCreation: (): SafeLogMessage => createSafeLogMessage('regex creation'),
  assetMatchCheck: (assetName: string): SafeLogMessage => createSafeLogMessage(`asset match check: ${assetName}`),
} as const;