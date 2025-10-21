import { createSafeLogMessage, type SafeLogMessageMap } from '@modules/logger';

export const registryDatabaseLogMessages = {
  initialized: () => createSafeLogMessage('Initialized SQLite file registry at: %s'),
} satisfies SafeLogMessageMap;
