import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';

export const toolInstallationRegistryLogMessages = {
  schemaInitialized: () => createSafeLogMessage('Schema initialization complete'),
  operationRecorded: () => createSafeLogMessage('Recorded %s operation for %s: %s'),
} satisfies SafeLogMessageMap;
