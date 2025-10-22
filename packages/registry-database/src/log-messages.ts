import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const registryDatabaseLogMessages = {
  initialized: () => createSafeLogMessage('Initialized SQLite file registry at: %s'),
} satisfies SafeLogMessageMap;
