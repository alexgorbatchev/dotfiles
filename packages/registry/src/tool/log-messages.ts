import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  schemaInitialized: () => createSafeLogMessage('Schema initialization complete'),
  operationRecorded: () => createSafeLogMessage('Recorded %s operation for %s: %s'),
} satisfies SafeLogMessageMap;
