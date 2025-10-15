import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';

export const registryDatabaseLogMessages = {
  initialized: () => createSafeLogMessage('Initialized SQLite file registry at: %s'),
} satisfies SafeLogMessageMap;
